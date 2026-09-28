import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SitesSignIn } from './ui/SitesSignIn';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {import.meta.env.MODE === 'sites' ? <SitesSignIn /> : <App />}
  </StrictMode>,
);
