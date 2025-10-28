import { Injectable } from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository';
import { User } from './entities/user.entity';
import { MyLogger } from '../../core/services/logger/logger.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('UsersService initialized', UsersService.name);
  }

  async findAll(): Promise<User[]> {
    this.logger.info('Finding all users', UsersService.name);
    try {
      const users = await this.usersRepository.findAll();
      this.logger.info(`Found ${users.length} users`, UsersService.name);
      return users;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to find all users', e.stack, UsersService.name);
      throw e;
    }
  }

  async findById(id: string): Promise<User | null> {
    this.logger.info(`Finding user by ID: ${id}`, UsersService.name);
    try {
      const user = await this.usersRepository.findById(id);
      if (user) {
        this.logger.info(`Found user: ${user.username}`, UsersService.name);
      } else {
        this.logger.warn(`User not found: ${id}`, UsersService.name);
      }
      return user;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to find user by ID: ${id}`,
        e.stack,
        UsersService.name,
      );
      throw e;
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    this.logger.info(
      `Finding user by username: ${username}`,
      UsersService.name,
    );
    try {
      const user = await this.usersRepository.findByUsername(username);
      if (user) {
        this.logger.info(`Found user: ${username}`, UsersService.name);
      } else {
        this.logger.warn(`User not found: ${username}`, UsersService.name);
      }
      return user;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to find user by username: ${username}`,
        e.stack,
        UsersService.name,
      );
      throw e;
    }
  }

  async create(user: Partial<User>): Promise<User> {
    this.logger.info(`Creating user: ${user.username}`, UsersService.name);
    try {
      const createdUser = await this.usersRepository.create(user);
      this.logger.info(
        `Successfully created user: ${createdUser.username}`,
        UsersService.name,
      );
      return createdUser;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to create user: ${user.username}`,
        e.stack,
        UsersService.name,
      );
      throw e;
    }
  }

  async update(id: string, user: Partial<User>): Promise<User | null> {
    this.logger.info(`Updating user: ${id}`, UsersService.name);
    try {
      const updatedUser = await this.usersRepository.update(id, user);
      if (updatedUser) {
        this.logger.info(
          `Successfully updated user: ${updatedUser.username}`,
          UsersService.name,
        );
      } else {
        this.logger.warn(`User not found for update: ${id}`, UsersService.name);
      }
      return updatedUser;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to update user: ${id}`,
        e.stack,
        UsersService.name,
      );
      throw e;
    }
  }

  async delete(id: string): Promise<User | null> {
    this.logger.info(`Deleting user: ${id}`, UsersService.name);
    try {
      const deletedUser = await this.usersRepository.delete(id);
      if (deletedUser) {
        this.logger.info(
          `Successfully deleted user: ${deletedUser.username}`,
          UsersService.name,
        );
      } else {
        this.logger.warn(
          `User not found for deletion: ${id}`,
          UsersService.name,
        );
      }
      return deletedUser;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to delete user: ${id}`,
        e.stack,
        UsersService.name,
      );
      throw e;
    }
  }
}
