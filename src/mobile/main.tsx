import '../styles.css';
import '../desktop-refinement.css';
import '../design-system/page-layout.css';
import '../composer/conversation-composer.css';
import '../agents/conversation-bubbles.css';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {AppsSDKUIProvider} from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import {ErrorBoundary} from '../components';
import {ENGINEER_SPACE} from '../space';
import {MobileApp} from './MobileApp';
import './mobile.css';

// A bare mobile link opens the existing Wanye example without creating a space.
const entry = new URL(location.href);
if (!entry.searchParams.has('space')) {
  entry.searchParams.set('space', ENGINEER_SPACE);
  history.replaceState(null, '', entry.pathname + entry.search + entry.hash);
}
document.body.classList.add('mobile-root');
createRoot(document.getElementById('root')!).render(<React.StrictMode><AppsSDKUIProvider linkComponent="a"><ErrorBoundary><MobileApp/></ErrorBoundary></AppsSDKUIProvider></React.StrictMode>);
