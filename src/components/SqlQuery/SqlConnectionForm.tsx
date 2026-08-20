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
  
  const [dsn, setDsn] = useState(DEFAULT_DSN);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    onConnect({
      dsn,
      username,
      password,
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Icon name="database" size="xxl" className={styles.icon} />
        <h2 className={styles.title}>Conexão Oracle</h2>
        <p className={styles.subtitle}>Conecte-se para executar consultas read-only</p>
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <Icon name="exclamation-triangle" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <Field label="DSN de Conexão" description="Cadeia de conexão do banco de dados (TNS)">
          <textarea
            className={styles.textarea}
            value={dsn}
            onChange={(e) => setDsn(e.target.value)}
            rows={10}
            required
            spellCheck={false}
          />
        </Field>

        <Field label="Usuário" description="Usuário restrito apenas para leitura">
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
          <Button type="submit" variant="primary" disabled={isConnecting || !username || !password || !dsn}>
            {isConnecting ? 'Conectando...' : 'Conectar ao Banco'}
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
    background-color: ${theme.colors.background.secondary};
  `,
  header: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: ${theme.spacing(4)};
    text-align: center;
  `,
  icon: css`
    color: ${theme.colors.primary.text};
    margin-bottom: ${theme.spacing(2)};
  `,
  title: css`
    margin: 0 0 ${theme.spacing(1)} 0;
  `,
  subtitle: css`
    margin: 0;
    color: ${theme.colors.text.secondary};
  `,
  form: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
    max-width: 500px;
    margin: 0 auto;
    width: 100%;
    
    /* Aumentar o fundo do form */
    background: ${theme.colors.background.primary};
    padding: ${theme.spacing(3)};
    border-radius: ${theme.shape.borderRadius(2)};
    border: 1px solid ${theme.colors.border.weak};
  `,
  textarea: css`
    width: 100%;
    background-color: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.borderRadius(1)};
    padding: ${theme.spacing(1)};
    color: ${theme.colors.text.primary};
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: ${theme.typography.size.sm};
    resize: vertical;
    &:focus {
      outline: 2px solid ${theme.colors.primary.border};
      outline-offset: -1px;
    }
  `,
  actions: css`
    display: flex;
    justify-content: flex-end;
    margin-top: ${theme.spacing(2)};
  `,
  errorAlert: css`
    background-color: ${theme.colors.error.transparent};
    color: ${theme.colors.error.text};
    padding: ${theme.spacing(2)};
    border-radius: ${theme.shape.borderRadius(1)};
    border-left: 4px solid ${theme.colors.error.main};
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
