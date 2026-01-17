import { Controller, Get } from '@nestjs/common';
import axios from 'axios';

@Controller('docs')
export class DocsProxyController {
  private readonly identityBase =
    process.env.IDENTITY_SERVICE_URL || 'http://identity-worker:3000';
  private readonly assistantBase =
    process.env.ASSISTANT_WORKER_URL || 'http://assistant-worker:3001';
  private readonly schedulingBase =
    process.env.SCHEDULING_WORKER_URL || 'http://scheduling-worker:3000';
  private readonly resumeBase =
    process.env.RESUME_WORKER_URL || 'http://resume-worker:3006';
  private readonly interviewBase =
    process.env.INTERVIEW_WORKER_URL || 'http://interview-worker:3004';
  private readonly dataBase =
    process.env.DATA_WORKER_URL || 'http://data-processing-worker:3003';
  private readonly latexBase =
    process.env.LATEX_WORKER_URL || 'http://latex-worker:3005';
  private readonly toolsBase =
    process.env.TOOLS_WORKER_URL || 'http://agent-tool-worker:3002';

  @Get('/identity/docs-json')
  async identityDocs() {
    const { data } = await axios.get(`${this.identityBase}/docs-json`);
    return data;
  }

  @Get('/assistants/docs-json')
  async assistantDocs() {
    const { data } = await axios.get(`${this.assistantBase}/docs-json`);
    return data;
  }

  @Get('/scheduling/docs-json')
  async schedulingDocs() {
    const { data } = await axios.get(`${this.schedulingBase}/docs-json`);
    return data;
  }

  @Get('/resume/docs-json')
  async resumeDocs() {
    const { data } = await axios.get(`${this.resumeBase}/docs-json`);
    return data;
  }

  @Get('/interview/docs-json')
  async interviewDocs() {
    const { data } = await axios.get(`${this.interviewBase}/docs-json`);
    return data;
  }

  @Get('/data/docs-json')
  async dataDocs() {
    const { data } = await axios.get(`${this.dataBase}/docs-json`);
    return data;
  }

  @Get('/latex/docs-json')
  async latexDocs() {
    const { data } = await axios.get(`${this.latexBase}/docs-json`);
    return data;
  }

  @Get('/tools/docs-json')
  async toolsDocs() {
    const { data } = await axios.get(`${this.toolsBase}/docs-json`);
    return data;
  }
}
