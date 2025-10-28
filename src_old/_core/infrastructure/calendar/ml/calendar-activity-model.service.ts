import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

// --- Interfaces for Type Safety ---

interface SlotRecommendation {
  time_slot: number;
  hour: number;
  probability: number;
  confidence: number;
  recommended: boolean;
}

interface PredictSlotsRequest {
  user_id: string;
  deliverable: Record<string, any>;
  context: Record<string, any>;
}

interface PredictSlotsResponse {
  recommendations: SlotRecommendation[];
}

// A generic interface for the kind of input the service might receive
// from other parts of the NestJS application.
interface CalendarActivityInput {
  eventData: {
    title: string;
    [key: string]: any;
  };
  userContext: Record<string, any>;
}

@Injectable()
export class CalendarActivityModelService {
  private readonly logger = new Logger(CalendarActivityModelService.name);
  // Allow override via env var to support hybrid dev (host or container)
  private readonly mlServiceBaseUrl =
    process.env.SCHEDULING_MODEL_URL || 'http://scheduling-model:8000';

  constructor(private readonly httpService: HttpService) {
    this.logger.log('CalendarActivityModelService initialized.');
  }

  /**
   * Predicts optimal scheduling slots by calling the external Python ML service.
   * This method replaces the old TensorFlow.js-based local prediction.
   *
   * @param userId The ID of the user for whom to predict.
   * @param proposedEvent The event or deliverable being scheduled.
   * @returns A promise that resolves to the prediction results.
   */
  async predict(
    userId: string,
    proposedEvent: Partial<CalendarActivityInput>,
  ): Promise<any> {
    this.logger.log(
      `Calling external ML service for prediction for user ${userId}`,
    );

    const requestBody: PredictSlotsRequest = {
      user_id: userId,
      deliverable: {
        title: proposedEvent.eventData?.title || 'Untitled Event',
        ...proposedEvent.eventData,
      },
      context: proposedEvent.userContext || {},
    };

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<PredictSlotsResponse>(
          `${this.mlServiceBaseUrl}/predict-slots`,
          requestBody,
        ),
      );

      // --- Response Adaptation ---
      // The goal is to adapt the detailed response from the Python service
      // to the format expected by the legacy parts of the application.
      const topRecommendation = data.recommendations[0] || {
        probability: 0.5,
        confidence: 0.5,
        recommended: false,
      };

      return {
        eventSuccess: topRecommendation.probability,
        userSatisfaction: topRecommendation.confidence,
        scheduleEfficiency:
          (topRecommendation.probability + topRecommendation.confidence) / 2,
        recommendation: topRecommendation.recommended ? 'approve' : 'modify',
        suggestions: data.recommendations.map(
          (r) =>
            `Suggest slot at ${r.hour}:00 (Confidence: ${r.confidence.toFixed(2)})`,
        ),
        raw_recommendations: data.recommendations,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Failed to get prediction from ML service: ${axiosError.message}`,
        axiosError.stack,
      );

      // Fallback to a default response to ensure system stability
      return {
        eventSuccess: 0.5,
        userSatisfaction: 0.5,
        scheduleEfficiency: 0.5,
        recommendation: 'modify',
        suggestions: ['Could not connect to ML service.'],
      };
    }
  }

  /**
   * A health check method to verify connection to the ML service.
   */
  async checkMlServiceHealth(): Promise<{ status: string; details?: any }> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.mlServiceBaseUrl}/health`),
      );
      return { status: 'ok', details: data };
    } catch (error) {
      const axiosError = error as AxiosError;
      return { status: 'error', details: { message: axiosError.message } };
    }
  }
}
