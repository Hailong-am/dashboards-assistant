/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, fireEvent, screen, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { HeaderChatButton } from './chat_header_button';
import { applicationServiceMock, chromeServiceMock } from '../../../src/core/public/mocks';
import { HeaderVariant } from '../../../src/core/public';
import { AssistantActions } from './types';
import * as coreContextExports from './contexts/core_context';
import { MountWrapper } from '../../../src/core/public/utils';

import { coreMock } from '../../../src/core/public/mocks';
import { Subject } from 'rxjs';
import { ConversationsService } from './services/conversations_service';

let mockSend: jest.Mock;
let mockLoadChat: jest.Mock;
let mockIncontextInsightRegistry: jest.Mock;
let mockGetLogoIcon: jest.Mock;

jest.mock('./hooks/use_chat_actions', () => {
  mockSend = jest.fn();
  mockLoadChat = jest.fn();
  return {
    useChatActions: jest.fn().mockReturnValue({
      send: mockSend,
      loadChat: mockLoadChat,
      openChatUI: jest.fn(),
      executeAction: jest.fn(),
      abortAction: jest.fn(),
      regenerate: jest.fn(),
    }),
  };
});

jest.mock('./chat_flyout', () => {
  return {
    ChatFlyout: () => <div aria-label="chat flyout mock" />,
  };
});

jest.mock('./services', () => {
  mockIncontextInsightRegistry = jest.fn().mockReturnValue({
    on: jest.fn(),
    off: jest.fn(),
  });
  mockGetLogoIcon = jest.fn().mockReturnValue('');
  return {
    getIncontextInsightRegistry: mockIncontextInsightRegistry,
    getLogoIcon: mockGetLogoIcon,
  };
});

const chromeStartMock = chromeServiceMock.createStartContract();
const sideCarHideMock = jest.fn(() => {
  const element = document.getElementById('sidecar-mock-div');
  if (element) {
    element.style.display = 'none';
  }
});

const sideCarRefMock = {
  close: jest.fn(),
};

const mockGetConversationsHttp = () => {
  const http = coreMock.createStart().http;
  http.get.mockImplementation(async () => ({
    objects: [
      {
        id: '1',
        title: 'foo',
      },
    ],
    total: 100,
  }));
  return http;
};

const dataSourceMock = {
  dataSourceIdUpdates$: new Subject<string | null>(),
  getDataSourceQuery: jest.fn(() => ({ dataSourceId: 'foo' })),
};

// mock sidecar open,hide and show
jest.spyOn(coreContextExports, 'useCore').mockReturnValue({
  services: {
    ...coreMock.createStart(),
    mockGetConversationsHttp,
    chrome: chromeStartMock,
    conversations: new ConversationsService(mockGetConversationsHttp, dataSourceMock),
    conversationLoad: {
      status$: {
        next: (param: string) => {
          return 'loading';
        },
      },
    },
    dataSource: dataSourceMock,
  },
  overlays: {
    // @ts-ignore
    sidecar: () => {
      const attachElement = document.createElement('div');
      attachElement.id = 'sidecar-mock-div';
      return {
        open: (mountPoint) => {
          document.body.appendChild(attachElement);
          render(<MountWrapper mount={mountPoint} />, {
            container: attachElement,
          });
          return sideCarRefMock;
        },
        hide: sideCarHideMock,
        show: () => {
          const element = document.getElementById('sidecar-mock-div');
          if (element) {
            element.style.display = 'block';
          }
        },
        getSidecarConfig$: () => {
          return new BehaviorSubject(undefined);
        },
      };
    },
  },
});

describe('<HeaderChatButton />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should open chat flyout, send the initial message and hide and show flyout', () => {
    const applicationStart = {
      ...applicationServiceMock.createStartContract(),
      currentAppId$: new BehaviorSubject(''),
    };
    render(
      <HeaderChatButton
        application={applicationStart}
        messageRenderers={{}}
        actionExecutors={{}}
        assistantActions={{} as AssistantActions}
        currentAccount={{ username: 'test_user' }}
      />
    );

    act(() => applicationStart.currentAppId$.next('mock_app_id'));

    screen.getByLabelText('chat input').focus();
    fireEvent.change(screen.getByLabelText('chat input'), {
      target: { value: 'what indices are in my cluster?' },
    });
    expect(screen.getByLabelText('chat input')).toHaveFocus();

    fireEvent.keyPress(screen.getByLabelText('chat input'), {
      key: 'Enter',
      code: 'Enter',
      charCode: 13,
    });

    // start a new chat
    expect(mockLoadChat).toHaveBeenCalled();
    // send chat message
    expect(mockSend).toHaveBeenCalledWith({
      type: 'input',
      contentType: 'text',
      content: 'what indices are in my cluster?',
      context: { appId: 'mock_app_id' },
    });
    // chat flyout displayed
    expect(screen.queryByLabelText('chat flyout mock')).toBeInTheDocument();
    // the input value is cleared after pressing enter
    expect(screen.getByLabelText('chat input')).toHaveValue('');
    expect(screen.getByLabelText('chat input')).not.toHaveFocus();

    // sidecar show
    const toggleButton = screen.getByLabelText('toggle chat flyout icon');
    fireEvent.click(toggleButton);
    expect(screen.queryByLabelText('chat flyout mock')).not.toBeVisible();
    // sidecar hide
    fireEvent.click(toggleButton);
    expect(screen.queryByLabelText('chat flyout mock')).toBeVisible();
  });

  it('should focus in chat input when click and press Escape should blur', () => {
    render(
      <HeaderChatButton
        application={applicationServiceMock.createStartContract()}
        messageRenderers={{}}
        actionExecutors={{}}
        assistantActions={{} as AssistantActions}
        currentAccount={{ username: 'test_user' }}
      />
    );
    screen.getByLabelText('chat input').focus();
    expect(screen.getByLabelText('chat input')).toHaveFocus();
    expect(screen.getByTitle('press enter to chat')).toBeInTheDocument();

    fireEvent.keyUp(screen.getByLabelText('chat input'), {
      key: 'Escape',
      code: 'Escape',
      charCode: 27,
    });
    expect(screen.getByLabelText('chat input')).not.toHaveFocus();
    expect(screen.getByTitle('press Ctrl + / to start typing')).toBeInTheDocument();
  });

  it('should focus on chat input when pressing global shortcut', () => {
    render(
      <HeaderChatButton
        application={applicationServiceMock.createStartContract()}
        messageRenderers={{}}
        actionExecutors={{}}
        assistantActions={{} as AssistantActions}
        currentAccount={{ username: 'test_user' }}
      />
    );
    expect(screen.getByLabelText('chat input')).not.toHaveFocus();
    fireEvent.keyDown(document.body, {
      key: '/',
      code: 'NumpadDivide',
      charCode: 111,
      ctrlKey: true,
    });
    expect(screen.getByLabelText('chat input')).toHaveFocus();
  });

  it('should not focus on chat input when no access and pressing global shortcut', () => {
    render(
      <HeaderChatButton
        application={applicationServiceMock.createStartContract()}
        messageRenderers={{}}
        actionExecutors={{}}
        assistantActions={{} as AssistantActions}
        currentAccount={{ username: 'test_user' }}
      />
    );
    expect(screen.getByLabelText('chat input')).not.toHaveFocus();
    fireEvent.keyDown(document.body, {
      key: '/',
      code: 'NumpadDivide',
      charCode: 111,
      metaKey: true,
    });
    expect(screen.getByLabelText('chat input')).not.toHaveFocus();
  });

  it('should call sidecar hide and close when button unmount and chat flyout is visible', async () => {
    const applicationStart = {
      ...applicationServiceMock.createStartContract(),
      currentAppId$: new BehaviorSubject(''),
    };
    const { unmount, getByLabelText } = render(
      <HeaderChatButton
        application={applicationStart}
        messageRenderers={{}}
        actionExecutors={{}}
        assistantActions={{} as AssistantActions}
        currentAccount={{ username: 'test_user' }}
      />
    );

    fireEvent.click(getByLabelText('toggle chat flyout icon'));

    expect(sideCarHideMock).not.toHaveBeenCalled();
    expect(sideCarRefMock.close).not.toHaveBeenCalled();
    unmount();
    expect(sideCarHideMock).toHaveBeenCalled();
    expect(sideCarRefMock.close).toHaveBeenCalled();
  });

  it('should render toggle chat flyout button icon', () => {
    chromeStartMock.getHeaderVariant$.mockReturnValue(
      new BehaviorSubject(HeaderVariant.APPLICATION)
    );
    render(
      <HeaderChatButton
        application={applicationServiceMock.createStartContract()}
        messageRenderers={{}}
        actionExecutors={{}}
        assistantActions={{} as AssistantActions}
        currentAccount={{ username: 'test_user' }}
        inLegacyHeader={false}
      />
    );
    expect(screen.getByLabelText('toggle chat flyout button icon')).toBeInTheDocument();
  });
});
