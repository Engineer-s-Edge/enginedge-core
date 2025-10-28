import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import VectorStoreModel, { VectorStore } from '../entities/store.entity';
import { VectorStoreIdType } from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';

@Injectable()
export class VectorStoreRepository {
  constructor(
    @InjectModel('vector_store')
    private readonly vectorStoreModel: typeof VectorStoreModel,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    this.logger.info(
      'VectorStoreRepository initializing',
      VectorStoreRepository.name,
    );
  }

  async findAll(): Promise<VectorStore[]> {
    this.logger.info(
      'Finding all vector store documents',
      VectorStoreRepository.name,
    );
    try {
      const result = await this.vectorStoreModel.find().exec();
      this.logger.info(
        `Found ${result.length} vector store documents`,
        VectorStoreRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        'Error finding all vector store documents',
        VectorStoreRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async findAllByOwnerId(ownerId: string): Promise<VectorStore[]> {
    this.logger.info(
      `Finding vector store documents for owner ${ownerId}`,
      VectorStoreRepository.name,
    );
    try {
      const result = await this.vectorStoreModel.find({ ownerId }).exec();
      this.logger.info(
        `Found ${result.length} vector store documents for owner ${ownerId}`,
        VectorStoreRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding vector store documents for owner ${ownerId}`,
        VectorStoreRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async findAllByAccess(userId: string): Promise<VectorStore[]> {
    this.logger.info(
      `Finding vector store documents accessible by user ${userId}`,
      VectorStoreRepository.name,
    );
    try {
      const result = await this.vectorStoreModel
        .find({
          $or: [{ ownerId: userId }, { allowedUserIds: { $in: [userId] } }],
        })
        .exec();
      this.logger.info(
        `Found ${result.length} vector store documents accessible by user ${userId}`,
        VectorStoreRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding vector store documents accessible by user ${userId}`,
        VectorStoreRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async findById(id: VectorStoreIdType): Promise<VectorStore | null> {
    this.logger.info(
      `Finding vector store document by ID ${id}`,
      VectorStoreRepository.name,
    );
    try {
      const result = await this.vectorStoreModel.findById(id).exec();
      if (result) {
        this.logger.info(
          `Found vector store document ${id}`,
          VectorStoreRepository.name,
        );
      } else {
        this.logger.warn(
          `Vector store document ${id} not found`,
          VectorStoreRepository.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding vector store document ${id}`,
        VectorStoreRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async findByDocumentId(documentId: string): Promise<VectorStore[]> {
    this.logger.info(
      `Finding vector store documents by document ID ${documentId}`,
      VectorStoreRepository.name,
    );
    try {
      const result = await this.vectorStoreModel.find({ documentId }).exec();
      this.logger.info(
        `Found ${result.length} vector store documents for document ID ${documentId}`,
        VectorStoreRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error finding vector store documents by document ID ${documentId}`,
        VectorStoreRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async create(store: Partial<VectorStore>): Promise<VectorStore> {
    this.logger.info(
      `Creating vector store document: ${store.documentName || 'unnamed'}`,
      VectorStoreRepository.name,
    );
    try {
      const newStore = new this.vectorStoreModel(store);
      const result = await newStore.save();
      this.logger.info(
        `Successfully created vector store document ${result._id}`,
        VectorStoreRepository.name,
      );
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error creating vector store document: ${store.documentName || 'unnamed'}`,
        VectorStoreRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async update(
    id: VectorStoreIdType,
    update: Partial<VectorStore>,
  ): Promise<VectorStore | null> {
    this.logger.info(
      `Updating vector store document ${id}`,
      VectorStoreRepository.name,
    );
    try {
      const result = await this.vectorStoreModel
        .findByIdAndUpdate(id, update, { new: true })
        .exec();
      if (result) {
        this.logger.info(
          `Successfully updated vector store document ${id}`,
          VectorStoreRepository.name,
        );
      } else {
        this.logger.warn(
          `Failed to update vector store document ${id} - document not found`,
          VectorStoreRepository.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error updating vector store document ${id}`,
        VectorStoreRepository.name,
        info.stack,
      );
      throw error;
    }
  }

  async delete(id: VectorStoreIdType): Promise<VectorStore | null> {
    this.logger.info(
      `Deleting vector store document ${id}`,
      VectorStoreRepository.name,
    );
    try {
      const result = await this.vectorStoreModel.findByIdAndDelete(id).exec();
      if (result) {
        this.logger.info(
          `Successfully deleted vector store document ${id}`,
          VectorStoreRepository.name,
        );
      } else {
        this.logger.warn(
          `Failed to delete vector store document ${id} - document not found`,
          VectorStoreRepository.name,
        );
      }
      return result;
    } catch (error) {
      const info = getErrorInfo(error);
      this.logger.error(
        `Error deleting vector store document ${id}`,
        VectorStoreRepository.name,
        info.stack,
      );
      throw error;
    }
  }
}
