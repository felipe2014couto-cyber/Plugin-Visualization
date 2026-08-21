import React, { useState, useEffect } from 'react';
import { Modal, Button, Field, Input, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';

interface SqlParamsModalProps {
  isOpen: boolean;
  params: string[];
  onConfirm: (values: Record<string, any>) => void;
  onDismiss: () => void;
}

export function SqlParamsModal({ isOpen, params, onConfirm, onDismiss }: SqlParamsModalProps) {
  const styles = useStyles2(getStyles);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      // Initialize any new params with empty strings, preserve existing ones
      setValues((prev) => {
        const next = { ...prev };
        for (const p of params) {
          if (next[p] === undefined) {
            next[p] = '';
          }
        }
        return next;
      });
    }
  }, [isOpen, params]);

  const handleChange = (param: string, value: string) => {
    setValues((prev) => ({ ...prev, [param]: value }));
  };

  const handleConfirm = () => {
    onConfirm(values);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      title="Variáveis de Bind Encontradas"
      isOpen={isOpen}
      onDismiss={onDismiss}
      onClickBackdrop={onDismiss}
      className={styles.modal}
    >
      <div className={styles.container}>
        <p className={styles.description}>
          Preencha os valores para as variáveis identificadas no seu script SQL:
        </p>
        
        <div className={styles.fields}>
          {params.map((param) => (
            <Field label={`:${param}`} key={param}>
              <Input
                value={values[param] || ''}
                onChange={(e) => handleChange(param, e.currentTarget.value)}
                placeholder={`Valor para ${param}...`}
                autoFocus={params[0] === param}
              />
            </Field>
          ))}
        </div>

        <Modal.ButtonRow>
          <Button variant="secondary" onClick={onDismiss} fill="outline">
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            Executar Query
          </Button>
        </Modal.ButtonRow>
      </div>
    </Modal>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  modal: css`
    width: 500px;
  `,
  container: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(2)};
  `,
  description: css`
    color: ${theme.colors.text.secondary};
    margin-bottom: ${theme.spacing(2)};
  `,
  fields: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
    max-height: 400px;
    overflow-y: auto;
    padding-right: ${theme.spacing(1)};
  `,
});
