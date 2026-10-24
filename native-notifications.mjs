import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

window.ClassNativeNotifications = {
  available: Capacitor.isNativePlatform(),
  async requestPermission() {
    if (!this.available) return { display: 'unsupported' };
    await LocalNotifications.createChannel({
      id: 'classe-cours',
      name: 'Cours et rappels',
      description: 'Rappels des prochaines séances de cours',
      importance: 5,
      visibility: 1,
      sound: 'default',
    }).catch(() => {});
    return LocalNotifications.requestPermissions();
  },
  checkPermission() {
    return this.available ? LocalNotifications.checkPermissions() : Promise.resolve({ display: 'unsupported' });
  },
  cancel(ids) {
    return this.available && ids.length ? LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) }) : Promise.resolve();
  },
  schedule(notifications) {
    return this.available ? LocalNotifications.schedule({ notifications }) : Promise.resolve();
  },
};
