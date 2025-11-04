import { Controller, Get, Param, Patch, Post, Delete, Query, UseGuards, Body } from '@nestjs/common';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { IdentityClientService } from './identity-client.service';
import { JwtAuthGuard } from './jwt.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly identity: IdentityClientService) {}

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getUserById(@Param('id') id: string) {
    return this.identity.getUserById(id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getUserByEmail(@Query('email') email?: string) {
    if (email) {
      return this.identity.getUserByEmail(email);
    }
    // List users - admin only, optional for now
    return { message: 'List users endpoint - admin only' };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateUser(@Param('id') id: string, @Body() body: any) {
    // Admin only - add role check if needed
    return this.identity.updateUser(id, body);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() body: any) {
    // Admin only - add role check if needed
    return this.identity.createUser(body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('id') id: string) {
    // Admin only - add role check if needed
    return this.identity.deleteUser(id);
  }
}

