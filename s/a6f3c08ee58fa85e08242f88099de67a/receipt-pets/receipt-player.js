import { loadDesktopPet, mountDesktopPet as mountImportedPet } from './player.js';
import { mountOriginalCat } from './original-cat.js';

export { loadDesktopPet };
export function mountDesktopPet(options) {
  return options.pet.id === 'original-cat' ? mountOriginalCat(options) : mountImportedPet(options);
}
