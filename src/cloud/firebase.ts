/**
 * Contrato de sincronização futura. Nenhuma chamada de nuvem é feita sem
 * configuração real; a V1 permanece totalmente funcional em IndexedDB.
 */
export const firebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
)

export const cloudStatus = firebaseConfigured
  ? 'Configuração Firebase detectada; conecte o adaptador autenticado antes de habilitar sincronização.'
  : 'Salvo neste dispositivo. Backup em nuvem não configurado.'
