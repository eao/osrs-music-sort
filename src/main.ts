import './styles.css';
import { renderApp } from './app';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Missing #app root element');
}

renderApp(root);
