import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { MyLogger } from '../../core/services/logger/logger.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private readonly logger: MyLogger,
  ) {
    this.logger.info('AuthService initialized', AuthService.name);
  }

  async validateUser(username: string, pass: string): Promise<any> {
    this.logger.info(
      `Validating user credentials for: ${username}`,
      AuthService.name,
    );
    try {
      const user = await this.usersService.findByUsername(username);
      if (user && (await bcrypt.compare(pass, user.password))) {
        // Convert Mongoose document to plain object before destructuring
        const userObj = (user as any).toObject ? (user as any).toObject() : user;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...result } = userObj;
        this.logger.info(
          `User validation successful for: ${username}. User data: ${JSON.stringify(result)}`,
          AuthService.name,
        );
        return result;
      }
      this.logger.warn(
        `User validation failed for: ${username}`,
        AuthService.name,
      );
      return null;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Error validating user: ${username}`,
        e.stack,
        AuthService.name,
      );
      throw e;
    }
  }

  async login(user: any) {
    this.logger.info(`Logging in user: ${user.username}`, AuthService.name);
    try {
      const payload = {
        username: user.username,
        sub: user._id,
        role: user.role,
      };
      const result = {
        access_token: this.jwtService.sign(payload),
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      };
      this.logger.info(
        `Login successful for user: ${user.username}`,
        AuthService.name,
      );
      return result;
    } catch (error: unknown) {
      const e = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Login failed for user: ${user.username}`,
        e.stack,
        AuthService.name,
      );
      throw e;
    }
  }
  async register(userData: any) {
    this.logger.info(
      `Registering new user: ${userData.username}`,
      AuthService.name,
    );
    try {
      const { password: plainPassword, ...userWithoutPassword } = userData;

      // Password strength validation
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(plainPassword)) {
        this.logger.warn(
          `Password validation failed for user: ${userData.username}`,
          AuthService.name,
        );
        throw new BadRequestException(
          'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.',
        );
      }

      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      const newUser = await this.usersService.create({
        ...userWithoutPassword,
        password: hashedPassword,
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = newUser as any;
      this.logger.info(
        `User registration successful for: ${userData.username}`,
        AuthService.name,
      );
      return result;
    } catch (error: unknown) {
      const e = error as any;
      if (e && typeof e === 'object' && 'code' in e && e.code === 11000) {
        // MongoDB duplicate key error
        const field =
          Object.keys((e.keyPattern as Record<string, unknown>) || {})[0] ||
          'field';
        this.logger.warn(
          `Duplicate key error during registration for user: ${userData.username}, field: ${field}`,
          AuthService.name,
        );
        throw new ConflictException(
          `${field.toLocaleUpperCase()} already exists`,
        );
      }
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Registration failed for user: ${userData.username}`,
        err.stack,
        AuthService.name,
      );
      throw err;
    }
  }
}
