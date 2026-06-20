const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application[0];
    
    // Add usesCleartextTraffic="true" to <application> tag
    if (!application.$) {
      application.$ = {};
    }
    application.$['android:usesCleartextTraffic'] = 'true';
    
    return config;
  });
};
