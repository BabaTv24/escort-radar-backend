type BcuInteger = string | number;

function toBcu(value: BcuInteger) {
  const normalized = String(value).trim();
  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) throw new Error('BCU balance must be a non-negative integer');
  return BigInt(normalized);
}

export function calculateAvailableBcu(balanceBcu: BcuInteger, lockedBalanceBcu: BcuInteger) {
  const balance = toBcu(balanceBcu);
  const locked = toBcu(lockedBalanceBcu);
  if (locked > balance) throw new Error('Locked BCU balance cannot exceed total balance');
  return (balance - locked).toString();
}

export function hasSufficientAvailableBcu(balanceBcu: BcuInteger, lockedBalanceBcu: BcuInteger, requiredBcu: BcuInteger) {
  return BigInt(calculateAvailableBcu(balanceBcu, lockedBalanceBcu)) >= toBcu(requiredBcu);
}
