import React, { Suspense } from 'react';
import { ActiveView } from '../types';
import { MOCK_TEMPLATES } from '../constants';
import { LoadingIndicator } from './LoadingIndicator';

// Direct import components to fix dynamic loading issue
import ChatbotView from './ChatbotView';
import AgentsView from './AgentsView';
import VoicesView from './VoicesView';
import CallLogsView from './CallLogsView';
import TTSStudioView from './TTSStudioView';
import ActiveCallView from './ActiveCallView';


interface CenterPanelProps {
  activeView: ActiveView;
  setGeneratedAppHtml: (html: string | null) => void;
}

const TemplateViewer: React.FC = () => {
    const template = MOCK_TEMPLATES[0];
    return (
        <div className="p-8 h-full overflow-y-auto">
            <h1 className="text-3xl font-bold text-eburon-fg mb-2">{template.name}</h1>
            <p className="text-eburon-fg/70 mb-6">{template.description}</p>
            
            <div className="mb-6">
                <h2 className="text-xl font-semibold text-eburon-fg mb-3">Use Cases</h2>
                <div className="flex flex-wrap gap-3">
                    {template.useCases.map(uc => (
                        <span key={uc} className="bg-eburon-panel border border-eburon-border text-eburon-accent px-3 py-1 rounded-full text-sm">{uc}</span>
                    ))}
                </div>
            </div>

            <div className="mb-6">
                <h2 className="text-xl font-semibold text-eburon-fg mb-3">System Prompt</h2>
                <div className="bg-eburon-panel p-4 rounded-xl border border-eburon-border">
                    <p className="text-eburon-fg/90 whitespace-pre-wrap font-mono text-sm">{template.systemPrompt}</p>
                </div>
            </div>

            <button className="bg-eburon-accent hover:bg-eburon-accent-dark text-white font-bold py-3 px-6 rounded-lg transition-colors duration-150">
                Use This Template
            </button>
        </div>
    );
};


export const CenterPanel: React.FC<CenterPanelProps> = ({ activeView, setGeneratedAppHtml }) => {
  const renderContent = () => {
    switch (activeView) {
      case ActiveView.Templates:
        return <TemplateViewer />;
      case ActiveView.Chatbot:
        return <ChatbotView setGeneratedAppHtml={setGeneratedAppHtml} />;
      case ActiveView.Agents:
        return <AgentsView />;
      case ActiveView.Voices:
        return <VoicesView />;
      case ActiveView.CallLogs:
        return <CallLogsView />;
      case ActiveView.TTSStudio:
        return <TTSStudioView />;
      case ActiveView.ActiveCall:
        return <ActiveCallView />;
      default:
        return <CallLogsView />;
    }
  };

  return (
    <main className="flex-1 bg-eburon-bg overflow-hidden">
      <Suspense fallback={<LoadingIndicator text={`Loading ${activeView}...`} />}>
        {renderContent()}
      </Suspense>
    </main>
  );
};