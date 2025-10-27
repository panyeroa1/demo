import React, { useState, useEffect } from 'react';
import { LeftSidebar } from './components/LeftSidebar';
import { CenterPanel } from './components/CenterPanel';
import { RightSidebar } from './components/RightSidebar';
import { ActiveView } from './types';
import { initializeDataLayer } from './services/dataService';
import { LoadingIndicator } from './components/LoadingIndicator';
import { CallProvider } from './contexts/CallContext';
import { GlobalCallIndicator } from './components/GlobalCallIndicator';


function App() {
  const [activeView, setActiveView] = useState<ActiveView>(ActiveView.CallLogs);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  const [isDataLayerInitialized, setIsDataLayerInitialized] = useState(false);
  const [generatedAppHtml, setGeneratedAppHtml] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      await initializeDataLayer();
      setIsDataLayerInitialized(true);
    };
    init();
  }, []);

  if (!isDataLayerInitialized) {
    return (
      <LoadingIndicator text="Initializing Eburon Studio..." size="large" />
    );
  }

  return (
    <CallProvider activeView={activeView}>
      <div className="h-screen w-screen flex bg-eburon-bg text-eburon-fg overflow-hidden">
        <LeftSidebar 
          activeView={activeView}
          setActiveView={setActiveView}
          isCollapsed={isLeftSidebarCollapsed}
          setIsCollapsed={setIsLeftSidebarCollapsed}
        />
        <CenterPanel 
          activeView={activeView} 
          setGeneratedAppHtml={setGeneratedAppHtml}
        />
        <RightSidebar
          isCollapsed={isRightSidebarCollapsed}
          setIsCollapsed={setIsRightSidebarCollapsed}
          activeView={activeView}
          generatedAppHtml={generatedAppHtml}
        />
        <GlobalCallIndicator 
            isRightSidebarCollapsed={isRightSidebarCollapsed} 
            setIsRightSidebarCollapsed={setIsRightSidebarCollapsed} 
        />
      </div>
    </CallProvider>
  );
}

export default App;