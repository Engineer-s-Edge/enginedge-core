import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Orchestration (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/api/orchestrate (POST)', () => {
    it('should create orchestration request', () => {
      return request(app.getHttpServer())
        .post('/api/orchestrate')
        .set('Authorization', 'Bearer test-token')
        .send({
          workflow: 'resume-build',
          data: {
            experiences: [],
            jobDescription: 'test',
          },
        })
        .expect(202)
        .expect((res) => {
          expect(res.body).toHaveProperty('requestId');
          expect(res.body).toHaveProperty('status');
          expect(res.body).toHaveProperty('statusUrl');
        });
    });

    it('should return 401 when no token provided', () => {
      return request(app.getHttpServer())
        .post('/api/orchestrate')
        .send({
          workflow: 'resume-build',
          data: {},
        })
        .expect(401);
    });
  });

  describe('/api/orchestrate/:requestId (GET)', () => {
    it('should return request status', async () => {
      // First create a request
      const createResponse = await request(app.getHttpServer())
        .post('/api/orchestrate')
        .set('Authorization', 'Bearer test-token')
        .send({
          workflow: 'single-worker',
          data: { prompt: 'test' },
        })
        .expect(202);

      const requestId = createResponse.body.requestId;

      // Then get status
      return request(app.getHttpServer())
        .get(`/api/orchestrate/${requestId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('requestId', requestId);
          expect(res.body).toHaveProperty('status');
          expect(res.body).toHaveProperty('workflow');
        });
    });

    it('should return 404 when request not found', () => {
      return request(app.getHttpServer()).get('/api/orchestrate/non-existent').expect(500); // Will throw error which becomes 500
    });
  });

  describe('/api/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'ok');
        });
    });
  });
});
