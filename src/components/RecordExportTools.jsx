import { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import './css/RecordCheckbox.css';

export function RecordCheckbox({ checked, partial = false, onChange, disabled = false, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = partial; }, [partial]);
  return <input ref={ref} type="checkbox" aria-label={label} aria-checked={partial ? 'mixed' : checked} checked={checked} disabled={disabled}
    className="gsea-record-checkbox-input"
    onClick={event => event.stopPropagation()} onChange={event => { event.stopPropagation(); onChange(event.target.checked); }} />;
}

export function RecordPageCheckbox({ controller }) {
  return <span className="gsea-record-checkbox"><RecordCheckbox label="Seleccionar registros de esta página" checked={controller.pageChecked} partial={controller.pagePartial} disabled={controller.pageDisabled} onChange={controller.togglePage} /></span>;
}

export function RecordRowCheckbox({ controller, id }) {
  return <span className="gsea-record-checkbox"><RecordCheckbox label={`Seleccionar registro ${id}`} checked={controller.selected(id)} disabled={!controller.selectable(id)} onChange={checked => controller.toggle([id], checked)} /></span>;
}

export default function RecordExportTools({ controller, buttonClass = '' }) {
  if (!controller.allowed) return null;
  return <>
    <button type="button" className={buttonClass} disabled={controller.disabled} onClick={controller.download} aria-busy={controller.busy}>
      <Download size={18} /><span>{controller.busy ? 'Exportando…' : 'Exportar'}</span>
    </button>
    {controller.error && <dialog open role="alertdialog" aria-label="Error de exportación">
      <p>{controller.error}</p><button type="button" onClick={controller.dismissError}>Cerrar</button>
    </dialog>}
  </>;
}
