const { ethers } = require('ethers');
const fs = require('fs');
const apiKey = '';

const provider = new ethers.AlchemyProvider("homestead", apiKey);
const eventSignature = ethers.id('PairCreated(address,address,address,uint256)'); //filter

let poolData = [];
// Standard ERC-20 Token ABI for the 'name' function
const tokenAbi = [
    "function name() view returns (string)"
  ];
// ABI for the `getReserves` function of Uniswap pair contract
const pairAbi = [
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
  ];


async function processEvent(log) {
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['address', 'uint256'], log.data);

    let token0 = log['topics'][1].toLowerCase();
    let token1 = log['topics'][2].toLowerCase();
    let pairAddress = decoded[0].toLowerCase();
    let poolIndex = decoded[1].toString();
    const pairContract = new ethers.Contract(pairAddress, tokenAbi, provider);
    const protocolName = await pairContract.name();

    let tokens = [token0, token1].sort();
    let poolInfo = {
        address: pairAddress,
        protocol: protocolName,
        tokens: tokens,
        factory: log.address.toLowerCase(),
        fee: 0, // Standard Uniswap V2 fee
        createdInBlock: log.blockNumber,
        createdInTx: log.transactionHash.toLowerCase(),
        index: poolIndex
    };

    poolData.push(poolInfo);    

}

async function getPairCreatedEvents(startBlock, endBlock) {
    const batchSize = 2000; // Set a reasonable batch size
    let currentBlock = startBlock;

    while (currentBlock < endBlock) {
        const batchEndBlock = Math.min(currentBlock + batchSize, endBlock);

        console.log(`Fetching events from block ${currentBlock} to ${batchEndBlock}`);

        try {
            const logs = await provider.getLogs({
                fromBlock: currentBlock,
                toBlock: batchEndBlock,
                topics: [eventSignature]
            });

            for (const log of logs) {
                // console.log(log);
                await processEvent(log);
                
            }
        } catch (error) {
            console.error(`Error fetching events in block range ${currentBlock} to ${batchEndBlock}:`, error);
        }
        try {
            // Asynchronously write to the JSON file
            const json = JSON.stringify(poolData, null, 2);
            await fs.promises.writeFile('uniswapPools.json', json);
            // console.log('Data written to file');
        } catch (error) {
            console.error('Error processing event or writing to file:', error);
        }
        currentBlock += batchSize + 1; // Move to the next batch
    }
}

async function findAllSwapEventsInFirstActiveBlock(pairContractInstance, createBlockTime) {
    const filter = {
        address: pairContractInstance.address,
        topics: [
            ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)")
        ],
        fromBlock: createBlockTime,
        toBlock: createBlockTime+2000
    };

    const logs = await provider.getLogs(filter);
    if (logs.length === 0) return [];

    // Find the first block number with swap events
    const firstSwapBlockNumber = logs[0].blockNumber;

    // Filter and return all swap events in the first active block
    return logs.filter(log => log.blockNumber === firstSwapBlockNumber);
}



async function getReservesAroundSwap(pairContract, swapBlockNumber) {
    // Get the reserves before the swap
    const reservesBefore = await pairContract.getReserves({ blockTag: swapBlockNumber - 1 });
    
    console.log(`Reserves before the swap: reserve0: ${reservesBefore.reserve0.toString()}, reserve1: ${reservesBefore.reserve1.toString()}`);
    
    // Get the reserves after the swap
    const reservesAfter = await pairContract.getReserves({ blockTag: swapBlockNumber });
    
    console.log(`Reserves after the swap: reserve0: ${reservesAfter.reserve0.toString()}, reserve1: ${reservesAfter.reserve1.toString()}`);
  
    return {
      before: reservesBefore,
      after: reservesAfter
    };
}

async function calculateCommission(pairContractInstance, swapEventLogs) {
    const swapBlockNumber = swapEventLogs[0].blockNumber;
    // console.log(swapEventLogs);
    tokenInFlow = [];
    tokenOutFlow = [];
    let dx, dy;
    // Decode the swap event log to get amounts in and out
    for (log of swapEventLogs) {
        const decodedLog = ethers.AbiCoder.defaultAbiCoder().decode(
            ['uint256', 'uint256', 'uint256', 'uint256'],
            log.data
        );

        const amount0In = decodedLog[0];
        const amount1In = decodedLog[1];
        const amount0Out = decodedLog[2];
        const amount1Out = decodedLog[3];

        
        if (!amount0In === 0) {
            dx = amount0In;
            dy = amount1Out;
        } else {
            dx = amount1In;
            dy = amount0Out;
        }

    }

        // Get reserves around the swap
        const reserves = await getReservesAroundSwap(pairContractInstance, swapBlockNumber);
        const reserve0Before = reserves.before.reserve0;
        const reserve0After = reserves.after.reserve0;
        const reserve1Before = reserves.before.reserve1;
        const reserve1After = reserves.after.reserve1;
        let x = reserve0Before<reserve0After?reserve0Before:reserve1Before;
        let y = reserve1Before>reserve1After?reserve1Before:reserve0Before;
       
        // Calculate commission
        // console.log(dx, dy, x, y, reserve0After, reserve1After)
        const scaleFactor = 10n ** 6n; // Scaling to six decimal places for intermediate calculation
        // Calculate the commission scaled up for precision
        const commissionScaled = (x * dy * scaleFactor) / ((y - dy) * dx);
        // Convert the scaled commission to a number for rounding
        let commissionDecimal = 1 - (Number(commissionScaled) / 10 ** 6); // Scaling down after conversion
        // Round to 3 decimal places
        commissionDecimal = Math.round(commissionDecimal * 1000) / 1000;

        // console.log(commissionDecimal);

    return commissionDecimal*1000000;
}

async function processPools(poolData) {
    let protocols = new Set();
    let commissionResults = {};
  
    // Identify unique protocols
    poolData.forEach(pool => {
      protocols.add(pool.protocol);
    });
  
    // Calculate commission for the first pool of each protocol
    for (let protocol of protocols) {
        const firstPool = poolData.find(p => p.protocol === protocol);
        if (firstPool) {
        const pairContractInstance = new ethers.Contract(firstPool.address, pairAbi, provider);
        const SwapEventLogs = await findAllSwapEventsInFirstActiveBlock(pairContractInstance, firstPool.createdInBlock);
        if (!SwapEventLogs) {
            console.log('No swap event found for this pool')} // No swap events found for this pool
        const commissionPercentage = await calculateCommission(pairContractInstance, SwapEventLogs);
        commissionResults[protocol] = commissionPercentage;
        }
        // Update all entries with the same protocol in poolData
        poolData.forEach(pool => {
            if (pool.protocol === protocol) {
                pool.fee = commissionPercentage;
            }
        });
    }

    return commissionResults;
}

function readMockPoolData(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading file from disk: ${error}`);
        return []; // Return an empty array in case of an error
    }
}

function testCalCommission(filePath){
    const mockPoolData = readMockPoolData(filePath);
    processPools(mockPoolData)
    .then(commissions => console.log("Commissions:", commissions))
    .catch(error => console.error("Error processing mock data:", error));

}

async function main(){
    const startBlock = 10000835; // the deployment block of the Uniswap V2 Factory
    let endBlock = await provider.getBlockNumber();
    await getPairCreatedEvents(startBlock, endBlock);
    await processPools(poolData)
    .then(commissions => console.log(commissions))
    .catch(error => console.error(error));
    
}
// testCalCommission('./uniswapPools.json');
main().catch(error => console.error(error));

