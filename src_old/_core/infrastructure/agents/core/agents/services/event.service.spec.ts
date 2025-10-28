import { EventEmitter } from 'events';
import { AgentEventService } from './event.service';

// Minimal BaseAgent stub with EventEmitter behavior
class StubAgent extends EventEmitter {}

const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

describe('AgentEventService', () => {
  const userId = 'user-1' as any;
  const conversationId = 'conv-1' as any;
  const type = 'react_custom' as any; // unique ReAct type path
  let service: AgentEventService;
  let logger: any;

  beforeEach(() => {
    logger = makeLogger();
    service = new AgentEventService(logger);
  });

  it('forwards agent events with context and supports specific event subscriptions', (done) => {
    const agent = new StubAgent();
    service.setupAgentEventForwarding(
      agent as any,
      userId,
      conversationId,
      type,
    );

    const unsub = service.subscribeToAgentEvents(
      userId,
      conversationId,
      type,
      ['agent-ready', 'llm-invocation-complete'],
      (evt) => {
        try {
          expect(evt.userId).toBe(userId);
          expect(evt.conversationId).toBe(conversationId);
          expect(['agent-ready', 'llm-invocation-complete']).toContain(
            evt.eventName,
          );
          unsub();
          done();
        } catch (e) {
          done(e);
        }
      },
    );

    // Emit an agent event
    agent.emit('agent-ready', { foo: 'bar' });
  });

  it('subscribeToEventType filters by eventName and agent context', (done) => {
    const agent = new StubAgent();
    service.setupAgentEventForwarding(
      agent as any,
      userId,
      conversationId,
      type,
    );

    const off = service.subscribeToEventType(
      'prompt-built',
      (evt) => {
        try {
          expect(evt.eventName).toBe('prompt-built');
          expect(evt.userId).toBe(userId);
          off();
          done();
        } catch (e) {
          done(e);
        }
      },
      { agentType: type, userId },
    );

    agent.emit('prompt-built', { bar: 'baz' });
  });

  it('getAgentActivityStream emits filtered activity and cleans up', (done) => {
    const agent = new StubAgent();
    service.setupAgentEventForwarding(
      agent as any,
      userId,
      conversationId,
      type,
    );

    const stream = service.getAgentActivityStream({
      includeEventTypes: ['llm-invocation-start'],
    });
    let received = 0;
    const onActivity = (evt: any) => {
      try {
        expect(evt.eventName).toBe('llm-invocation-start');
        received++;
        stream.removeListener('activity', onActivity);
        expect(received).toBe(1);
        done();
      } catch (e) {
        done(e);
      }
    };
    stream.on('activity', onActivity);

    agent.emit('llm-invocation-start', { foo: 'bar' });
  });

  it('removeAgentEventForwarding removes listeners', () => {
    const agent = new StubAgent();
    const spy = jest.spyOn(agent, 'removeAllListeners');
    service.removeAgentEventForwarding(agent as any);
    expect(spy).toHaveBeenCalled();
  });
});
