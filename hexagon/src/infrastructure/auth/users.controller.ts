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
  Req,
} from '@nestjs/common';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { IdentityClientService } from './identity-client.service';
import { JwtAuthGuard } from './jwt.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

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
  async getUserByEmail(@Query('email') email?: string, @Req() req?: Request) {
    if (email) {
      return this.identity.getUserByEmail(email);
    }
    // Admin-only list
    const roles = (req?.user as any)?.roles as string[] | undefined;
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
