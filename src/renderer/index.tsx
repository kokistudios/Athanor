import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SpecPopout } from './components/specs/SpecPopout';
import './index.css';

const isSpecPopout = window.location.hash === '#spec-popout';

const root = createRoot(document.getElementById('root')!);
root.render(isSpecPopout ? <SpecPopout /> : <App />);
