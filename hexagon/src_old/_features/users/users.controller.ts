import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../core/infrastructure/auth/roles.decorator';
import { MyLogger } from '../../core/services/logger/logger.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('UsersController initialized', UsersController.name);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get()
  async findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string): Promise<User | null> {
    return this.usersService.findById(id);
  }

  @Post()
  async create(@Body() user: Partial<User>): Promise<User> {
    this.logger.info(
      `Creating user via API: ${user.username}`,
      UsersController.name,
    );
    try {
      const result = await this.usersService.create(user);
      this.logger.info(
        `Successfully created user via API: ${result.username}`,
        UsersController.name,
      );
      return result;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to create user via API: ${user.username}`,
        e.stack,
        UsersController.name,
      );
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() user: Partial<User>,
  ): Promise<User | null> {
    return this.usersService.update(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  async delete(@Param('id') id: string): Promise<User | null> {
    return this.usersService.delete(id);
  }
}
