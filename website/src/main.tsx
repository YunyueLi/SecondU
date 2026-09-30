import React from 'react';
import {createRoot} from 'react-dom/client';
import {AppsSDKUIProvider} from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import './site.css';
import App from './App';
import {SiteLanguageProvider} from './site-language';
import {SiteThemeProvider} from './site-theme';
createRoot(document.getElementById('root')!).render(<React.StrictMode><SiteLanguageProvider><SiteThemeProvider><AppsSDKUIProvider linkComponent="a"><App/></AppsSDKUIProvider></SiteThemeProvider></SiteLanguageProvider></React.StrictMode>);
