import { call, put, delay, select, take, all, fork, cancelled } from 'redux-saga/effects';
import { Configuration } from '@energyweb/utils-general';
import { SagaIterator } from 'redux-saga';
import {
    hideAccountChangedModal,
    showAccountChangedModal,
    setEnvironment,
    IEnvironment,
    GeneralActions,
    setCurrencies,
    setExternalDeviceIdTypes,
    setCompliance,
    setCountry,
    setRegions,
    setOffChainDataSource
} from './actions';
import { getConfiguration } from '../selectors';
import {
    getAccountChangedModalVisible,
    getAccountChangedModalEnabled,
    getEnvironment,
    getOffChainDataSource
} from './selectors';
import { UsersActions } from '../users/actions';
import { isUsingInBrowserPK } from '../authentication/selectors';
import axios, { Canceler } from 'axios';
import { IOffChainDataSource, OffChainDataSource } from '@energyweb/origin-backend-client';

function* showAccountChangedModalOnChange(): SagaIterator {
    while (true) {
        yield take(UsersActions.updateCurrentUserId);
        const conf: Configuration.Entity = yield select(getConfiguration);

        if (!conf) {
            return;
        }

        try {
            const initialAccounts: string[] = yield call(
                conf.blockchainProperties.web3.eth.getAccounts
            );

            while (true) {
                const accountChangedModalEnabled: boolean = yield select(
                    getAccountChangedModalEnabled
                );
                const usingInBrowserPrivateKey: boolean = yield select(isUsingInBrowserPK);

                if (!accountChangedModalEnabled || usingInBrowserPrivateKey) {
                    break;
                }

                const accountChangedModalVisible: boolean = yield select(
                    getAccountChangedModalVisible
                );
                const accounts: string[] = yield call(
                    conf.blockchainProperties.web3.eth.getAccounts
                );

                if (accountChangedModalVisible) {
                    if (initialAccounts[0] === accounts[0]) {
                        yield put(hideAccountChangedModal());
                    }
                } else if (initialAccounts[0] !== accounts[0]) {
                    yield put(showAccountChangedModal());
                }

                yield delay(1000);
            }
        } catch (error) {
            console.error('showAccountChangedModalOnChange() error', error);
        }
    }
}

function prepareGetEnvironmentTask(): {
    getEnvironment: () => Promise<IEnvironment>;
    cancel: Canceler;
} {
    const source = axios.CancelToken.source();

    return {
        getEnvironment: async () => {
            try {
                const response = await axios.get('env-config.js', {
                    cancelToken: source.token
                });

                return response.data;
            } catch (error) {
                if (!axios.isCancel(error)) {
                    console.warn('Error while fetching env-config.js', error?.message ?? error);
                }
            }

            return {
                MODE: 'development',
                BACKEND_URL: 'http://localhost',
                BACKEND_PORT: '3030',
                BLOCKCHAIN_EXPLORER_URL: 'https://volta-explorer.energyweb.org',
                WEB3: 'http://localhost:8545',
                REGISTRATION_MESSAGE_TO_SIGN: 'I register as Origin user'
            };
        },
        cancel: source.cancel
    };
}

async function getComplianceFromAPI(offChainDataSource: IOffChainDataSource) {
    try {
        return (await offChainDataSource.configurationClient.get()).complianceStandard;
    } catch {
        return null;
    }
}

async function getCurrenciesFromAPI(offChainDataSource: IOffChainDataSource) {
    try {
        const { currencies } = await offChainDataSource.configurationClient.get();

        if (currencies.length > 0) {
            return currencies;
        }

        return null;
    } catch (error) {
        console.warn('Error while trying to get currency', {
            message: error?.message,
            config: error?.config
        });
        return null;
    }
}

async function getExternalDeviceIdTypesFromAPI(offChainDataSource: IOffChainDataSource) {
    try {
        const { externalDeviceIdTypes } = await offChainDataSource.configurationClient.get();

        if (externalDeviceIdTypes.length > 0) {
            return externalDeviceIdTypes;
        }

        return null;
    } catch (error) {
        console.warn('Error while trying to get externalDeviceIdTypes', {
            message: error?.message,
            config: error?.config
        });
        return null;
    }
}

async function getCountryFromAPI(offChainDataSource: IOffChainDataSource) {
    const { countryName, regions } = await offChainDataSource.configurationClient.get();

    return {
        name: countryName,
        regions
    };
}

function* setupEnvironment(): SagaIterator {
    let getEnvironmentTask: ReturnType<typeof prepareGetEnvironmentTask>;

    try {
        getEnvironmentTask = yield call(prepareGetEnvironmentTask);

        const environment: IEnvironment = yield call(getEnvironmentTask.getEnvironment);

        yield put(setEnvironment(environment));
    } finally {
        if (yield cancelled()) {
            getEnvironmentTask.cancel();
        }
    }
}

function* fillCurrency(): SagaIterator {
    while (true) {
        yield take([GeneralActions.setEnvironment, GeneralActions.setOffChainDataSource]);

        const environment: IEnvironment = yield select(getEnvironment);
        const offChainDataSource: IOffChainDataSource = yield select(getOffChainDataSource);

        if (!environment || !offChainDataSource) {
            continue;
        }

        const currencies = yield call(getCurrenciesFromAPI, offChainDataSource);

        yield put(
            setCurrencies({
                currencies
            })
        );
    }
}

function* fillExternalDeviceIdTypes(): SagaIterator {
    while (true) {
        yield take([GeneralActions.setEnvironment, GeneralActions.setOffChainDataSource]);

        const environment: IEnvironment = yield select(getEnvironment);
        const offChainDataSource: IOffChainDataSource = yield select(getOffChainDataSource);

        if (!environment || !offChainDataSource) {
            continue;
        }

        const externalDeviceIdTypes = yield call(
            getExternalDeviceIdTypesFromAPI,
            offChainDataSource
        );

        yield put(
            setExternalDeviceIdTypes({
                externalDeviceIdTypes
            })
        );
    }
}

function* fillCompliance(): SagaIterator {
    while (true) {
        yield take([GeneralActions.setEnvironment, GeneralActions.setOffChainDataSource]);

        const environment: IEnvironment = yield select(getEnvironment);
        const offChainDataSource: IOffChainDataSource = yield select(getOffChainDataSource);

        if (!environment || !offChainDataSource) {
            continue;
        }

        try {
            const compliance = yield call(getComplianceFromAPI, offChainDataSource);

            yield put(setCompliance(compliance));
        } catch (error) {
            console.warn('Could not set compliance due to an error: ', error?.message);
        }
    }
}

function* fillCountryAndRegions(): SagaIterator {
    while (true) {
        yield take([GeneralActions.setEnvironment, GeneralActions.setOffChainDataSource]);

        const environment: IEnvironment = yield select(getEnvironment);
        const offChainDataSource: IOffChainDataSource = yield select(getOffChainDataSource);

        if (!environment || !offChainDataSource) {
            continue;
        }

        try {
            const country = yield call(getCountryFromAPI, offChainDataSource);

            if (!country) {
                console.warn(
                    `Country from API is null. It might result in application not functioning.`
                );
            }

            yield put(setCountry(country ? country.name : null));
            yield put(setRegions(country ? country.regions : null));
        } catch (error) {
            console.warn(`Could not set country and regions due to an error: `, error?.message);
        }
    }
}

function* initializeOffChainDataSource(): SagaIterator {
    while (true) {
        yield take(GeneralActions.setEnvironment);

        const environment: IEnvironment = yield select(getEnvironment);
        const offChainDataSource: IOffChainDataSource = yield select(getOffChainDataSource);

        if (!environment || offChainDataSource) {
            continue;
        }

        yield put(
            setOffChainDataSource(
                new OffChainDataSource(environment.BACKEND_URL, Number(environment.BACKEND_PORT))
            )
        );
    }
}

export function* generalSaga(): SagaIterator {
    yield all([
        fork(showAccountChangedModalOnChange),
        fork(setupEnvironment),
        fork(initializeOffChainDataSource),
        fork(fillCurrency),
        fork(fillCompliance),
        fork(fillCountryAndRegions),
        fork(fillExternalDeviceIdTypes)
    ]);
}
