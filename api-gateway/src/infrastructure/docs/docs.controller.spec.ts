import { DocsProxyController } from './docs.controller';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DocsProxyController', () => {
  let controller: DocsProxyController;

  beforeEach(() => {
    controller = new DocsProxyController();
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: { openapi: '3.0.0' } });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should fetch identity docs', async () => {
    await controller.identityDocs();
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('identity-worker'));
  });

  it('should fetch assistant docs', async () => {
    await controller.assistantDocs();
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('assistant-worker'));
  });

  it('should fetch scheduling docs', async () => {
    await controller.schedulingDocs();
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('scheduling-worker'));
  });

  it('should fetch resume docs', async () => {
    await controller.resumeDocs();
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('resume-worker'));
  });

  it('should fetch interview docs', async () => {
    await controller.interviewDocs();
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('interview-worker'));
  });

  it('should fetch data docs', async () => {
    await controller.dataDocs();
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('data-processing-worker'));
  });

  it('should fetch latex docs', async () => {
    await controller.latexDocs();
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('latex-worker'));
  });

  it('should fetch tools docs', async () => {
    await controller.toolsDocs();
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('agent-tool-worker'));
  });
});
