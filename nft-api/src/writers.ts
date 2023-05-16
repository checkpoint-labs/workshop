import type { CheckpointWriter } from '@snapshot-labs/checkpoint';
import { convertToDecimal, getEvent } from './utils/utils';
import { createNft, isErc721, loadNft, newNft, Nft } from './utils/nft';
import { createAccount, newAccount, Account, loadAccount } from './utils/account';

export async function handleTransfer({
  block,
  tx,
  rawEvent,
  mysql
}: Parameters<CheckpointWriter>[0]) {
  try {
  if (!rawEvent) return;
  if (!(await isErc721(rawEvent.from_address, block.block_number))) return;
  const format = 'from, to, value(uint256)';
  const data: any = getEvent(rawEvent.data, format);
  let nft: Nft;
  let fromAccount: Account;
  let toAccount: Account;

  // If nft isn't indexed yet we add it, else we load it
  if (await newNft(rawEvent.from_address, mysql)) {
    nft = await createNft(rawEvent.from_address);
    console.log(nft)
    await mysql.queryAsync(`INSERT IGNORE INTO nftcollections SET ?`, [nft]);
  } else {
    nft = await loadNft(rawEvent.from_address, mysql);
  }

  // If accounts aren't indexed yet we add them, else we load them
  // First with fromAccount
  const fromId = `${nft.id.slice(2)}-${data.from.slice(2)}`;
  if (await newAccount(fromId, mysql)) {
    fromAccount = await createAccount(nft, fromId, tx, block);
    await mysql.queryAsync(`INSERT IGNORE INTO accountnfts SET ?`, [fromAccount]);
  } else {
    fromAccount = await loadAccount(fromId, mysql);
  }

  // Then with toAccount
  const toId = `${nft.id.slice(2)}-${data.to.slice(2)}`;
  if (await newAccount(toId, mysql)) {
    toAccount = await createAccount(nft, toId, tx, block);
    await mysql.queryAsync(`INSERT IGNORE INTO accountnfts SET ?`, [toAccount]);
  } else {
    toAccount = await loadAccount(toId, mysql);
  }

  // Updating balances
  console.log(data.value)
  fromAccount.balance -= data.value;
  toAccount.balance += data.value;
  // Updating modified field
  fromAccount.modified = block.timestamp;
  toAccount.modified = block.timestamp;
  // Updating tx field
  fromAccount.tx = tx.transaction_hash || '';
  toAccount.tx = tx.transaction_hash || '';

  // Indexing accounts
  await mysql.queryAsync(
    `UPDATE accountnfts SET balance=${
      fromAccount.balance
    }, modified=${fromAccount.modified}, tx='${
      fromAccount.tx
    }' WHERE id='${fromAccount.id}'`
  );
  await mysql.queryAsync(
    `UPDATE accountnfts SET balance=${
      toAccount.balance
    }, modified=${toAccount.modified}, tx='${
      toAccount.tx
    }' WHERE id='${toAccount.id}'`
  );
} catch (error) {
  // handle any errors thrown by the try block
  console.error('An error occurred:', error);
}
}
