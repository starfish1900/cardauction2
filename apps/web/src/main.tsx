import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installDebugHandle } from './debug';
import { Gallery } from './Gallery';
import './i18n';
import { connect } from './net/connection';
import './styles.css';

// ?gallery shows every card face, for checking the artwork.
const gallery = new URLSearchParams(window.location.search).has('gallery');
if (!gallery) connect();
installDebugHandle();

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">{gallery ? <Gallery /> : <App />}</MotionConfig>
  </StrictMode>,
);
