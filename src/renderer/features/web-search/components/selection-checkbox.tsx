import clsx from 'clsx';

import {
    SelectionEntry,
    useIsSelecting,
    useWebSearchSelectionStore,
} from '../store/web-search-selection-store';
import styles from './web-search.module.css';

import { Checkbox } from '/@/shared/components/checkbox/checkbox';

interface SelectionCheckboxProps {
    className?: string;
    entry: SelectionEntry;
    selectionKey: string;
}

/** Case de sélection multiple ; le parent doit porter la classe `styles.selectable`. */
export const SelectionCheckbox = ({ className, entry, selectionKey }: SelectionCheckboxProps) => {
    const isSelected = useWebSearchSelectionStore((s) => Boolean(s.entries[selectionKey]));
    const toggle = useWebSearchSelectionStore((s) => s.toggle);
    const isSelecting = useIsSelecting();

    return (
        <Checkbox
            aria-label="Sélectionner"
            checked={isSelected}
            className={clsx(styles.selectBox, className)}
            onChange={() => toggle(selectionKey, entry)}
            onClick={(e) => e.stopPropagation()}
            size="xs"
            // Mantine envoie les attributs inconnus sur l'input : la racine passe par wrapperProps
            wrapperProps={{ 'data-visible': String(isSelecting || isSelected) }}
        />
    );
};
