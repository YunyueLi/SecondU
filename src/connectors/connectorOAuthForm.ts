import type {SaveConnector} from '../../shared/connectors';

export interface OAuthFormFields {
  clientId:string;
  clientSecret:string;
  clearClientSecret:boolean;
  scopes:string;
  callbackPort:string;
  issuerUrl:string;
  resourceUrl:string;
  defaultIssuer?:string;
}

/** Empty editable fields must clear prior configuration, not silently retain it. */
export function oauthFormConfig(fields:OAuthFormFields):NonNullable<SaveConnector['oauth']> {
  const scopes=fields.scopes.trim();
  return {
    clientId:fields.clientId.trim(),
    ...(fields.clientSecret?{clientSecret:fields.clientSecret}:{}),
    clearClientSecret:fields.clearClientSecret,
    scopes:scopes?scopes.split(/\s+/):null,
    callbackPort:fields.callbackPort.trim()?Number(fields.callbackPort):0,
    issuerUrl:fields.issuerUrl.trim()||fields.defaultIssuer||'',
    resourceUrl:fields.resourceUrl.trim(),
  };
}
