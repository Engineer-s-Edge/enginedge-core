import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  UseGuards,
  Body,
} from '@nestjs/common';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { IdentityClientService } from './identity-client.service';
import { JwtAuthGuard } from './jwt.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { Req } from '@nestjs/common';
import { Request } from 'express';

// Extend Express Request to include user property
interface RequestWithUser extends Request {
  user?: any;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly identity: IdentityClientService) {}

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getUserById(@Param('id') id: string) {
    return this.identity.getUserById(id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getUserByEmail(
    @Query('email') email?: string,
    @Req() req?: RequestWithUser,
  ) {
    if (email) {
      return this.identity.getUserByEmail(email);
    }
    const roles = req?.user?.roles as string[] | undefined;
    if (!roles || !roles.includes('admin')) {
      return { message: 'Forbidden: admin role required' };
    }
    return this.identity.listUsers();
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  async updateUser(@Param('id') id: string, @Body() body: any) {
    return this.identity.updateUser(id, body);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin')
  async createUser(@Body() body: any) {
    return this.identity.createUser(body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  async deleteUser(@Param('id') id: string) {
    return this.identity.deleteUser(id);
  }
}
