import { SigmaverseProgram } from '@/app/hooks';
import { CyborStream, CyborRace } from '@/sigmaverse';
import { useEffect, useState, useCallback } from 'react';
import { useAccount, useBalanceFormat, useSendMessage, useBalance, BigNumber } from '@gear-js/react-hooks';
import { Unity, useUnityContext } from 'react-unity-webgl';

import { web3FromSource, web3Accounts } from '@polkadot/extension-dapp';


interface UnityReactChannelRequest {
  act: string;
  req: string;
}

export const UnityComponent = () => {
  const { account, isAccountReady } = useAccount();
  const { balance, isBalanceReady } = useBalance(account?.address);
  const [allMyCybors, setMyCybors] = useState<Array<[number | string | bigint, CyborStream]>>([]);

  const { getFormattedBalanceValue } = useBalanceFormat();

  const { unityProvider, sendMessage, isLoaded } = useUnityContext({
    loaderUrl: 'Cybor-WebGL/Build/Cybor-WebGL.loader.js',
    dataUrl: 'Cybor-WebGL/Build/Cybor-WebGL.data',
    frameworkUrl: 'Cybor-WebGL/Build/Cybor-WebGL.framework.js',
    codeUrl: 'Cybor-WebGL/Build/Cybor-WebGL.wasm',
  });


  const refreshAccount = useCallback(async () => {
    if (!account) {
      alert("select wallet account first.")
      return null;
    }
    // const allAccounts = await web3Accounts();

    // var externalAccount = null;
    if (account) {
      var externalAccount = {...account};
      var injector = await web3FromSource(externalAccount.meta.source);
      return {externalAccount, injector};
    }
    // for (var a of allAccounts) {
    //   console.log(a);
    //   console.log(account);
    //   if (a.address == account?.address) {
    //     externalAccount = a;
    //   }
    // }
  }, [account, isAccountReady]);

  var fetchMyCybors = () => {
    SigmaverseProgram.cyborNft
      .allMyCybors(account?.address)
      .then((result) => {
        console.log('Fetch All My Cybor :::: ', account?.address, result);
        setMyCybors(result);
      })
      .catch((error) => {
        console.error('Error fetching my cybors:', error);
      });
  };


  var convertCyborsStateToMapping = (
    arr: Array<[number | string | bigint, CyborStream]>,
  ): { [key: string]: CyborStream } => {
    // return arr.reduce((acc, [id, stream]) => {
    //   const bigIntId = BigInt(id).toString();
    //   acc[bigIntId] = stream;
    //   return acc;
    // }, {} as { [key: string]: CyborStream });

    return arr.reduce((acc, [id, stream]) => {
      acc[id.toString()] = stream;
      return acc;
    }, {} as { [key: string]: CyborStream });
  };

  // ------------- 发起调用Unity函数的消息 -------------
  // const testCallUnity = () => {
  //   CallUnityFunction('test', { test: ' test' });
  // };
  var CallUnityFunction = useCallback(
    (act: string, resp: object) => {
      if (isLoaded) {
        var respStr = JSON.stringify(resp);
        // TODO Encrypt
        var msg = JSON.stringify({ Act: act, Resp: respStr });
        console.debug('CallUnity MSG ::::: ', msg);
        sendMessage('WebGLChannel', 'WaitReactCallMe', msg);
      }
    },
    [isLoaded],
  );

  // 钱包信息更新
  useEffect(() => {
    // notify unity return to login scene if changed
    if (isLoaded) {
      var b = BigNumber(0, 10);
      if (balance) {
        b = getFormattedBalanceValue(balance + '');
      }
      console.log('Wallet-Info ::::: ', account?.address, b, isBalanceReady);
      CallUnityFunction('wallet_info', {
        address: account?.address,
        balance: b ? b : 0,
      });
    }
    return () => {};
  }, [account, isAccountReady, balance, isBalanceReady, isLoaded]);

  // 更换钱包重新加载 Cybors & Imprints
  useEffect(() => {
    fetchMyCybors();
  }, [account, isAccountReady]);

  // CyborNFT 有更新 通知 Unity
  useEffect(() => {
    if (isLoaded) {
      var _ret = convertCyborsStateToMapping(allMyCybors);
      console.log('MyCybors-Info ::::: ', allMyCybors, _ret);
      CallUnityFunction('all_my_cybors', _ret);
    }
  }, [allMyCybors]);

  // ------------- 处理来自 Unity 调用 React 的消息 -------------
  const handleUnityMessage = useCallback((event: CustomEvent) => {
    var message = event.detail;
    console.log('React收到来自Unity的消息:', message, isLoaded);
    try {
      var req = JSON.parse(message) as UnityReactChannelRequest;
      // TODO dencrypt body
      var reqBody = JSON.parse(req.req);

      if ('wallet_info' === req.act) {
        var b = BigNumber(0, 10);
        if (balance) {
          b = getFormattedBalanceValue(balance + '');
        }
        CallUnityFunction('wallet_info', {
          address: account?.address,
          balance: b,
        });
      } else if ('all_my_cybors' === req.act) {
        var _ret = convertCyborsStateToMapping(allMyCybors);
        console.log('MyCybors-Info ::::: ', allMyCybors, _ret);
        CallUnityFunction('all_my_cybors', _ret);
      
      } else if ('mint_cybor' === req.act) {

        if (account && isAccountReady) {
          const cyborRace = reqBody['race'].toLowerCase() as CyborRace;
          
          const mintCybor = async () => {
            try {
              const result = await refreshAccount();
              if (!result || !result.externalAccount || !result.injector) {
                return;
              }
              const {externalAccount, injector} = result;
              const transaction = SigmaverseProgram.cyborNft.mint(cyborRace);
              transaction.withAccount(externalAccount.address, { signer: injector.signer });

              // 设置消息的值
              if (cyborRace === "nguyen") {
                var b = BigNumber(0, 10);
                if (balance) {
                  b = getFormattedBalanceValue(balance + '');
                }
                if (b < BigNumber(2 * 1e12)) {
                  alert("Insufficient balance");
                  return;
                }
                transaction.withValue(BigInt(2 * 1e12)); // 2 VARA
              } else {
                // TODO 等待从 SigmaverseProgram.cyborNft.getTemplate 获取价格
              }

              await transaction.calculateGas();
              await transaction.signAndSend();
              
              // 铸造后刷新 cybor 列表
              fetchMyCybors();
            } catch (error) {
              console.error('铸造 cybor 时出错:', error);
              CallUnityFunction('mint_error', { message: '铸造 cybor 时出错' });
            }
          };

          mintCybor();
        } else {
          console.error('账户未准备好进行铸造');
          CallUnityFunction('mint_error', { message: '账户未准备好进行铸造' });
        }
      }
    } catch (err) {
      console.debug('DEBUG:::: ' + err);
    }
  }, [isLoaded, balance, account, allMyCybors, CallUnityFunction, getFormattedBalanceValue]);
  useEffect(() => {
    window.addEventListener('MessageFromUnity', handleUnityMessage as EventListener);
    return () => {
      window.removeEventListener('MessageFromUnity', handleUnityMessage as EventListener);
    };
  }, [handleUnityMessage]);

  // ------------- 渲染 unity & 动态调整大小 -------------
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const updateDimensions = useCallback(() => {
    const aspectRatio = 4 / 2.2;
    let newWidth = window.innerWidth;
    let newHeight = window.innerHeight;

    if (newWidth / newHeight > aspectRatio) {
      newWidth = newHeight * aspectRatio;
    } else {
      newHeight = newWidth / aspectRatio;
    }
    setDimensions({ width: newWidth, height: newHeight });
  }, []);
  useEffect(() => {
    window.addEventListener('resize', updateDimensions);
    updateDimensions();
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, [updateDimensions]);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      {/* <button onClick={testCallUnity} style={{ position: 'absolute', top: 10, left: 500 }}>
          Send Message to Unity
        </button> */}
      <div style={{ width: dimensions.width, height: dimensions.height }}>
        <Unity
          unityProvider={unityProvider}
          style={{ width: '100%', height: '80%', paddingTop: ' 2%', paddingLeft: '2%', paddingRight: '4%' }}
        />
      </div>
    </div>
  );
};
