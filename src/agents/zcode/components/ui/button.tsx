// SecondU host adapter; not upstream presentation.
import {Button as SdkButton} from '@openai/apps-sdk-ui/components/Button';
import type {ComponentProps} from 'react';
type Props=Omit<ComponentProps<typeof SdkButton>,'size'|'variant'|'color'> & {size?:'default'|'xs'|'sm'|'lg'|'icon'|'icon-xs'|'icon-sm'|'icon-md'|'icon-lg';variant?:'default'|'outline'|'secondary'|'ghost'|'destructive'|'warning'|'link'};
/** Host control adapter: official SDK behavior, SecondU control dimensions. */
export function Button({size='default',variant='default',className='',...props}:Props){return <SdkButton {...props} size="sm" color={variant==='default'?'primary':variant==='destructive'?'danger':'secondary'} variant={variant==='ghost'||variant==='link'?'ghost':variant==='outline'?'outline':'solid'} uniform={size.startsWith('icon')} className={`zc-button ${className}`} data-zc-size={size}/>;}
