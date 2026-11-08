import type { Address } from '../../../shared/store';

export function readAddress(form: FormData): Address {
  return {
    fullName: String(form.get('fullName') ?? ''),
    phone: String(form.get('phone') ?? ''),
    street: String(form.get('street') ?? ''),
    city: String(form.get('city') ?? ''),
    state: String(form.get('state') ?? ''),
    pin: String(form.get('pin') ?? '')
  };
}

export function AddressFields({ address, fullName }: { address: Address | null; fullName: string }) {
  return <div className="form-grid">
    <label className="field">Recipient name<input required name="fullName" maxLength={100} autoComplete="shipping name" defaultValue={address?.fullName ?? fullName} /></label>
    <label className="field">Mobile number<input required name="phone" type="tel" maxLength={15} autoComplete="shipping tel" defaultValue={address?.phone}
      pattern="(?:\+91(?: |-)?)?[6-9][0-9]{9}" title="Use a 10-digit Indian mobile number, optionally with +91." /></label>
    <label className="field field-wide">Street address<input required name="street" maxLength={240} autoComplete="shipping street-address" defaultValue={address?.street} /></label>
    <label className="field">City<input required name="city" maxLength={100} autoComplete="shipping address-level2" defaultValue={address?.city} /></label>
    <label className="field">State or union territory<input required name="state" maxLength={100} autoComplete="shipping address-level1" defaultValue={address?.state} /></label>
    <label className="field">Indian PIN code<input required name="pin" inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} autoComplete="shipping postal-code" defaultValue={address?.pin} /></label>
  </div>;
}
