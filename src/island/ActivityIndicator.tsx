/** Indicador pequeño de actividad: barritas que bailan cuando Tico trabaja, un punto si no. */
export function ActivityIndicator({ busy, error }: { busy: boolean; error: boolean }) {
  return (
    <span className={`activity${busy ? " is-busy" : ""}${error ? " is-error" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
