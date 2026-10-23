import { defineBackground } from 'wxt/utils/define-background';
import { startBackground } from '../src/engine/background';

export default defineBackground(() => {
  startBackground();
});
