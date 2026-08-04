// Transfer-pair construction. Pure preview of the two-leg shape finance.record_transfer()
// builds server-side (design.md §5.6/§3.4): same transfer_group_id, opposite signs, sum zero.

export type TransferLeg = {
  transferGroupId: string;
  accountId: string;
  amountCents: number; // signed
};

export function buildTransferPair(input: {
  transferGroupId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number; // positive magnitude
}): [TransferLeg, TransferLeg] {
  if (input.amountCents <= 0) {
    throw new RangeError("transfer amountCents must be a positive magnitude");
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new RangeError("a transfer requires two distinct accounts");
  }
  const magnitude = Math.abs(input.amountCents);
  return [
    { transferGroupId: input.transferGroupId, accountId: input.fromAccountId, amountCents: -magnitude },
    { transferGroupId: input.transferGroupId, accountId: input.toAccountId, amountCents: magnitude },
  ];
}

/** Invariant check: a transfer pair must sum to exactly zero. */
export function transferPairSumsToZero(pair: [TransferLeg, TransferLeg]): boolean {
  return pair[0].amountCents + pair[1].amountCents === 0;
}
