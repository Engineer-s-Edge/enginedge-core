export class KubeConfig {
  loadFromDefault() {}
  makeApiClient() {
    return {};
  }
}

export class CoreV1Api {
  listNamespacedService() {
    return Promise.resolve({});
  }
}
