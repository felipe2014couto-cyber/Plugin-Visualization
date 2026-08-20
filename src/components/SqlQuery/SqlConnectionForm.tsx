import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Icon, Button, Input, Field, SecretInput } from '@grafana/ui';
import type { OracleConnectParams } from './oracleApi';

interface SqlConnectionFormProps {
  onConnect: (params: OracleConnectParams) => void;
  isConnecting: boolean;
  error?: string;
}

const DEFAULT_DSN = `(DESCRIPTION =
  (ADDRESS_LIST =
    (ADDRESS =
      (PROTOCOL = TCP)
      (HOST = 10.247.0.236)
      (PORT = 1521)
    )
  )
  (CONNECT_DATA =
    (SERVICE_NAME = po40)
  )
)`;

export function SqlConnectionForm({ onConnect, isConnecting, error }: SqlConnectionFormProps) {
  const styles = useStyles2(getStyles);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      return;
    }
    
    onConnect({
      dsn: DEFAULT_DSN,
      username,
      password,
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Icon name="database" size="xxl" className={styles.icon} />
        <h2 className={styles.title}>Conexão SIP</h2>
        <p className={styles.subtitle}>Conecte-se ao SIP para executar consultas</p>
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <Icon name="exclamation-triangle" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <Field label="Usuário" description="Usuário de acesso ao SIP">
          <Input
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            placeholder="usuario"
            required
            autoComplete="off"
          />
        </Field>

        <Field label="Senha" description="A senha não será salva e não persistirá no painel">
          <SecretInput
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            placeholder="senha"
            required
            autoComplete="new-password"
            isConfigured={false} // Never hide behind "Configured" state
            onReset={() => setPassword('')}
          />
        </Field>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={isConnecting || !username || !password}>
            {isConnecting ? 'Conectando...' : 'Conectar ao SIP'}
          </Button>
        </div>
      </form>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    padding: ${theme.spacing(4)};
    height: 100%;
    overflow-y: auto;
    color: var(--text-primary);
    background-color: var(--surface-secondary);
  `,
  header: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: ${theme.spacing(4)};
    text-align: center;
  `,
  icon: css`
    color: var(--accent);
    margin-bottom: ${theme.spacing(2)};
  `,
  title: css`
    margin: 0 0 ${theme.spacing(1)} 0;
  `,
  subtitle: css`
    margin: 0;
    color: var(--text-secondary);
  `,
  form: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
    max-width: 500px;
    margin: 0 auto;
    width: 100%;
    color: var(--text-primary);
    
    /* Aumentar o fundo do form */
    background: var(--surface-primary);
    padding: ${theme.spacing(3)};
    border-radius: ${theme.shape.borderRadius(2)};
    border: 1px solid var(--border-color);

    input {
      box-sizing: border-box;
      width: 100%;
      color: var(--text-primary) !important;
      background: var(--input-bg) !important;
      border-color: var(--border-color) !important;
    }

    input::placeholder {
      color: var(--text-secondary) !important;
      opacity: 0.8 !important;
    }

    label, small {
      color: var(--text-secondary);
    }

    label {
      color: var(--text-primary) !important;
    }

    /* Grafana's Field renders descriptions in a nested span. Keep them
       readable in both themes instead of inheriting the dark input color. */
    & > div > div > label > span,
    & > div > label > span {
      color: var(--text-secondary) !important;
      opacity: 1 !important;
      font-size: 12px;
      line-height: 1.35;
    }

    & > div {
      color: var(--text-secondary);
    }
  `,
  actions: css`
    display: flex;
    justify-content: flex-end;
    margin-top: ${theme.spacing(2)};

    button {
      color: var(--accent-contrast) !important;
      background: var(--accent) !important;
      border-color: var(--accent) !important;
    }
  `,
  errorAlert: css`
    background-color: var(--surface-elevated);
    color: var(--danger);
    padding: ${theme.spacing(2)};
    border-radius: ${theme.shape.borderRadius(1)};
    border-left: 4px solid var(--danger);
    margin-bottom: ${theme.spacing(3)};
    display: flex;
    align-items: flex-start;
    gap: ${theme.spacing(1)};
    font-size: ${theme.typography.size.sm};
    max-width: 500px;
    margin: 0 auto ${theme.spacing(3)} auto;
    width: 100%;
  `,
});
