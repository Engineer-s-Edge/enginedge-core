import { Injectable } from '@nestjs/common';
import { ScheduleItem, AvailableTimeSlot } from '../dto/scheduling.dto';
import { MyLogger } from '../../../core/services/logger/logger.service';

@Injectable()
export class TaskSplittingService {
  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'TaskSplittingService initialized',
      TaskSplittingService.name,
    );
  }

  splitItemIntoChunks(
    item: ScheduleItem,
    availableSlots: AvailableTimeSlot[],
  ): ScheduleItem[] {
    this.logger.info(
      `splitItemIntoChunks: Item "${item.title}" (${item.estimatedDuration} min) with ${availableSlots.length} available slots`,
      TaskSplittingService.name,
    );
    availableSlots.forEach((slot, i) => {
      this.logger.info(
        `  Available slot ${i + 1}: ${slot.duration} min`,
        TaskSplittingService.name,
      );
    });

    if (availableSlots.length === 0) {
      if (item.estimatedDuration >= 20) {
        this.logger.info(
          `  No slots available, creating default chunks for large item`,
          TaskSplittingService.name,
        );
        return this.createDefaultChunks(item);
      }
      this.logger.info(
        `  No slots available, returning original small item`,
        TaskSplittingService.name,
      );
      return [item];
    }

    const maxAvailableSlot = Math.max(
      ...availableSlots.map((slot) => slot.duration),
    );
    this.logger.info(
      `  Max available slot: ${maxAvailableSlot} min`,
      TaskSplittingService.name,
    );

    if (item.estimatedDuration <= maxAvailableSlot) {
      this.logger.info(
        `  Item fits in largest slot (${item.estimatedDuration} <= ${maxAvailableSlot}), not splitting`,
        TaskSplittingService.name,
      );
      return [item];
    }

    this.logger.info(
      `  Item needs splitting (${item.estimatedDuration} > ${maxAvailableSlot})`,
      TaskSplittingService.name,
    );

    if (maxAvailableSlot < 5) {
      if (item.estimatedDuration >= 20) {
        this.logger.info(
          `  Largest slot < 5 min, creating default chunks for large item`,
          TaskSplittingService.name,
        );
        return this.createDefaultChunks(item);
      }
      this.logger.info(
        `  Largest slot < 5 min, returning original small item`,
        TaskSplittingService.name,
      );
      return [item];
    }

    this.logger.info(
      `  Starting slot-based splitting...`,
      TaskSplittingService.name,
    );
    const chunks: ScheduleItem[] = [];
    let remainingDuration = item.estimatedDuration;
    let partNumber = 1;

    const sortedSlots = [...availableSlots]
      .filter((slot) => slot.duration >= 5)
      .sort((a, b) => b.duration - a.duration);

    this.logger.info(
      `  Sorted slots for processing: ${sortedSlots.length} slots >= 5 min`,
      TaskSplittingService.name,
    );
    sortedSlots.forEach((slot, i) => {
      this.logger.info(
        `    Sorted slot ${i + 1}: ${slot.duration} min`,
        TaskSplittingService.name,
      );
    });

    for (const slot of sortedSlots) {
      if (remainingDuration <= 0) break;

      const chunkSize = Math.min(remainingDuration, slot.duration);
      this.logger.info(
        `  Processing slot ${slot.duration} min: chunkSize = min(${remainingDuration}, ${slot.duration}) = ${chunkSize}`,
        TaskSplittingService.name,
      );

      if (chunkSize >= 5) {
        this.logger.info(
          `    Creating chunk ${partNumber}: ${chunkSize} min`,
          TaskSplittingService.name,
        );
        chunks.push({
          ...item,
          id: `${item.id}_part_${partNumber}`,
          title: `${item.title} (Part ${partNumber})`,
          estimatedDuration: chunkSize,
          originalDuration: item.estimatedDuration,
          partNumber,
          totalParts: 0,
          isSplit: true,
        });

        remainingDuration -= chunkSize;
        partNumber++;
        this.logger.info(
          `    Remaining duration: ${remainingDuration} min`,
          TaskSplittingService.name,
        );
      } else {
        this.logger.info(
          `    Chunk too small (${chunkSize} < 10), skipping`,
          TaskSplittingService.name,
        );
      }
    }

    this.logger.info(
      `  Strategy 1 complete. Created ${chunks.length} chunks, remaining duration: ${remainingDuration} min`,
      TaskSplittingService.name,
    );

    while (remainingDuration > 0 && maxAvailableSlot >= 10) {
      const chunkSize = Math.min(remainingDuration, maxAvailableSlot);
      this.logger.info(
        `  Strategy 2: Creating chunk ${partNumber} with ${chunkSize} min (remaining: ${remainingDuration})`,
        TaskSplittingService.name,
      );

      if (chunkSize >= 5) {
        chunks.push({
          ...item,
          id: `${item.id}_part_${partNumber}`,
          title: `${item.title} (Part ${partNumber})`,
          estimatedDuration: chunkSize,
          originalDuration: item.estimatedDuration,
          partNumber,
          totalParts: 0,
          isSplit: true,
        });

        remainingDuration -= chunkSize;
        partNumber++;
      } else {
        if (chunks.length > 0) {
          this.logger.info(
            `    Adding remaining ${remainingDuration} min to last chunk`,
            TaskSplittingService.name,
          );
          chunks[chunks.length - 1].estimatedDuration += remainingDuration;
        } else {
          this.logger.info(
            `    Creating 5-min chunk for remaining ${remainingDuration} min`,
            TaskSplittingService.name,
          );
          chunks.push({
            ...item,
            id: `${item.id}_part_${partNumber}`,
            title: `${item.title} (Part ${partNumber})`,
            estimatedDuration: 5,
            originalDuration: item.estimatedDuration,
            partNumber,
            totalParts: 0,
            isSplit: true,
          });
        }
        break;
      }
    }

    this.logger.info(
      `  Strategy 2 complete. Total chunks: ${chunks.length}, final remaining duration: ${remainingDuration} min`,
      TaskSplittingService.name,
    );

    if (chunks.length === 0 && item.estimatedDuration >= 5) {
      this.logger.info(
        `  No chunks created, falling back to default chunking`,
        TaskSplittingService.name,
      );
      return this.createDefaultChunks(item);
    }

    const totalParts = chunks.length;
    chunks.forEach((chunk) => {
      chunk.totalParts = totalParts;
    });

    this.logger.info(
      `  Final result: ${chunks.length} chunks created`,
      TaskSplittingService.name,
    );
    chunks.forEach((chunk, i) => {
      this.logger.info(
        `    Final chunk ${i + 1}: ${chunk.title} (${chunk.estimatedDuration} min)`,
        TaskSplittingService.name,
      );
    });

    return chunks.length > 0 ? chunks : [item];
  }

  private createDefaultChunks(item: ScheduleItem): ScheduleItem[] {
    const chunks: ScheduleItem[] = [];
    let remainingDuration = item.estimatedDuration;
    let partNumber = 1;

    while (remainingDuration > 0) {
      let chunkSize: number;

      if (remainingDuration >= 60) {
        chunkSize = 60;
      } else if (remainingDuration >= 30) {
        chunkSize = 30;
      } else if (remainingDuration >= 20) {
        chunkSize = 20;
      } else {
        chunkSize = Math.max(remainingDuration, 10);
      }

      chunkSize = Math.min(chunkSize, remainingDuration);

      chunks.push({
        ...item,
        id: `${item.id}_part_${partNumber}`,
        title: `${item.title} (Part ${partNumber})`,
        estimatedDuration: chunkSize,
        originalDuration: item.estimatedDuration,
        partNumber,
        totalParts: 0,
        isSplit: true,
      });

      remainingDuration -= chunkSize;
      partNumber++;

      if (partNumber > 100) {
        break;
      }
    }

    const totalParts = chunks.length;
    chunks.forEach((chunk) => {
      chunk.totalParts = totalParts;
    });

    return chunks;
  }
}
