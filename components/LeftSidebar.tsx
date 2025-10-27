import React, { useEffect } from 'react';
import { ActiveView } from '../types';
import { NAV_ITEMS } from '../constants';
import { ChevronLeftIcon } from './icons';
import { useCall } from '../contexts/CallContext';

interface LeftSidebarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isCollapsed: boolean;
  setIsCollapsed: (isCollapsed: boolean) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ activeView, setActiveView, isCollapsed, setIsCollapsed }) => {
  const { status } = useCall();
  const isCallActive = status === 'dialing' || status === 'ringing' || status === 'connected';

  useEffect(() => {
    if (!isCallActive && activeView === ActiveView.ActiveCall) {
      // If the call ends while on the live view, switch to a default view
      setActiveView(ActiveView.CallLogs);
    }
  }, [isCallActive, activeView, setActiveView]);

  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (item.id === ActiveView.ActiveCall) {
      return isCallActive;
    }
    return true;
  });

  return (
    <div className={`bg-eburon-panel border-r border-eburon-border flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-4 py-3 border-b border-eburon-border h-20`}>
        {!isCollapsed && (
          <img src="https://eburon.vercel.app/logo-dark.png" alt="Eburon Logo" className="h-[45px] w-[120px] object-contain" />
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-lg hover:bg-white/10 text-eburon-fg"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeftIcon className={`w-6 h-6 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} />
        </button>
      </div>
      <nav className="flex-grow p-4 space-y-2">
        {visibleNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`w-full flex items-center p-3 rounded-lg text-left transition-all duration-200 ease-in-out group ${
              isCollapsed ? 'justify-center' : ''
            } ${
              activeView === item.id
                ? 'bg-eburon-accent text-white'
                : `text-eburon-fg hover:bg-white/10 ${!isCollapsed ? 'hover:translate-x-1' : 'hover:scale-105'}`
            }`}
          >
            <item.icon className={`w-6 h-6 transition-transform duration-200 ease-in-out ${activeView !== item.id ? 'group-hover:rotate-[-5deg]' : ''}`} />
            {!isCollapsed && <span className="ml-4 font-semibold">{item.label}</span>}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-eburon-border">
         <div className={`flex items-center ${isCollapsed ? 'justify-center' : ''}`}>
            {/* User Profile Section */}
         </div>
      </div>
    </div>
  );
};