import * as React from 'react';
import { render } from '@react-email/components';
import { template } from './src/lib/email-templates/agenda-reminder.tsx';
const data = {
  destinatarioNome: 'Ricardo',
  eventoTitulo: 'Casa Cod 1187',
  eventoTipo: '',
  inicioIso: '2026-07-23T19:00:00+00:00',
  local: '',
  clienteNome: '',
  imovelDescricao: '',
  offsetMin: 1440,
  link: 'https://cordialgestao.com/agenda?id=bcba4489-7027-492c-874f-aacd3b07705f',
};
const el = React.createElement(template.component, data);
const html = await render(el);
const text = await render(el, { plainText: true });
const subject = template.subject(data);
process.stdout.write(JSON.stringify({ subject, html, text }));
