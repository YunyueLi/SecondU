import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppsSDKUIProvider } from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import { ErrorBoundary } from './components';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<React.StrictMode><AppsSDKUIProvider linkComponent="a"><ErrorBoundary><App /></ErrorBoundary></AppsSDKUIProvider></React.StrictMode>);
