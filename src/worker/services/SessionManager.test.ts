import { sessionManager } from './SessionManager';
import * as sessionRepository from '../../shared/services/session.repository';

// Mock the session repository
jest.mock('../../shared/services/session.repository');
const mockedSessionRepository = sessionRepository as jest.Mocked<typeof sessionRepository>;

describe('SessionManager', () => {
  beforeEach(() => {
    // Clear all instances and calls to constructor and all methods:
    jest.clearAllMocks();
  });

  it('should initialize sessions from the database on startup', () => {
    const mockSessions = [
      { id: 'session1', friendlyName: 'Session 1' },
      { id: 'session2', friendlyName: 'Session 2' },
    ];
    mockedSessionRepository.getSessionConfigs.mockReturnValue(mockSessions);

    // The constructor is called when the module is imported, so we need to re-import it
    // to trigger the constructor again.
    const { sessionManager: newSessionManager } = require('./SessionManager');

    expect(mockedSessionRepository.getSessionConfigs).toHaveBeenCalledTimes(1);
  });
});