// Runtime bytes are pinned: an upstream update requires an explicit review.
const revision = 'b1de66b0b1f1cb881d95fb6158622aeb6a2827bd';
const repository = 'https://raw.githubusercontent.com/Live2D/CubismWebSamples/' + revision + '/';
const model = repository + 'Samples/Resources/Wanko/';

export const live2dSampleFiles = {
  'live2dcubismcore.min.js': {
    url: 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
    sha256: '25ae938cb4fe282ce189b357bcc97e603d1e1f7ec78bf04150d401c23cdc792f',
  },
  'Wanko/Wanko.model3.json': { url: model + 'Wanko.model3.json', sha256: '66627edce440b236d0d9757c65e408b9081a2e4d4ddcfb3fd2d48bac617b3764' },
  'Wanko/Wanko.moc3': { url: model + 'Wanko.moc3', sha256: 'ae474fc8f67aa7491ed39d76cfbeadf22bed1b40a7d57a7ed5fefe35107e83ad' },
  'Wanko/Wanko.physics3.json': { url: model + 'Wanko.physics3.json', sha256: '941fcfe315000b83d7b7eafdb2971301f1f9446e07eff437947e0f9e7bdbe849' },
  'Wanko/Wanko.1024/texture_00.png': { url: model + 'Wanko.1024/texture_00.png', sha256: 'ac8b02a0f259dcf03ca46960baaea3d340298cd8c606ea3a1b3d95a77a94ea3b' },
  'LICENSE.samples.md': { url: repository + 'LICENSE.md' },
  'RedistributableFiles.txt': { url: repository + 'Core/RedistributableFiles.txt' },
  'FreeMaterialLicense.html': { url: 'https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html' },
  'SampleModelTerms.html': { url: 'https://www.live2d.com/eula/live2d-sample-model-terms_en.html' },
  'CoreLicense.html': { url: 'https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html' },
};
