import { Nft } from './nft';

export type Account = {
  id: string;
  account: string;
  collection: string;
  tokenId: string;
  balance: number;
  name: string;
  modified: number;
  tx: string;
};

export async function newAccount(accountId: string, mysql): Promise<boolean> {
  const newAccount = await loadAccount(accountId, mysql);

  return !newAccount;
}

export async function createAccount(nft: Nft, accountId: string, tx, block): Promise<Account> {
  return {
    id: accountId,
    account: accountId.split('-')[1],
    collection: nft.id,
    tokenId: nft.id,
    balance: 0,
    name: "test",
    modified: block.timestamp / 1000,
    tx: tx.transaction_hash
  };
}

export async function loadAccount(accountId: string, mysql): Promise<Account> {
  const account: Account = await mysql.queryAsync(`SELECT * FROM accountnfts WHERE id = ?`, [
    accountId
  ]);

  return account[0];
}
