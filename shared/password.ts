export const minimumPasswordLength = 8;
export const maximumPasswordLength = 128;
export const passwordPattern = /^(?=[\s\S]*[A-Z])(?=[\s\S]*[a-z])(?=[\s\S]*[\p{P}\p{S}])[\s\S]*$/u;
export const passwordHint = `Use at least ${minimumPasswordLength} characters, including an uppercase letter, a lowercase letter and a special character.`;
