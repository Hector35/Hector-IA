const patchPhotoInputs = () => {
  const rxFile = document.getElementById('rxFile');
  const floorFile = document.getElementById('floorFile');
  if (rxFile?.hasAttribute('capture')) rxFile.removeAttribute('capture');
  if (floorFile?.hasAttribute('capture')) floorFile.removeAttribute('capture');

  const rxButton = document.getElementById('rxPhoto');
  const floorButton = document.getElementById('floorPhoto');
  if (rxButton && rxButton.textContent !== '📷 Foto o galería') rxButton.textContent = '📷 Foto o galería';
  if (floorButton && floorButton.textContent !== '📷 Foto o galería') floorButton.textContent = '📷 Foto o galería';
};

patchPhotoInputs();
new MutationObserver(patchPhotoInputs).observe(document.documentElement, {childList: true, subtree: true});
