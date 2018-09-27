import React, { Component } from 'react';
import { StyleSheet, Text, View, Image, LayoutAnimation } from 'react-native';
import { connectComponent, OnoClient } from './DataClient';

const sectionText = {
  color: '#222',
  fontSize: 120,
};

const nameText = {
  fontSize: 100,
  fontWeight: 'bold',
  color: '#333',
};

const withTruckState = Component => {
  const ComponentWithData = connectComponent(Component);
  return () => (
    <ComponentWithData
      truckState={OnoClient.getRef('truckState').watchObject()}
    />
  );
};

const ACTIVE_COLOR = '#FFC0B3';

const PickupBay = ({ pickupReadyName }) => {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        backgroundColor: pickupReadyName ? ACTIVE_COLOR : '#eee',

        margin: 50,
        marginBottom: 0,
      }}
    >
      {pickupReadyName && (
        <React.Fragment>
          <Text
            style={{
              ...sectionText,
              fontSize: 80,
              textAlign: 'center',
              color: 'white',
            }}
          >
            Pickup Ready
          </Text>
          <Text style={{ ...nameText, textAlign: 'center', color: 'white' }}>
            {pickupReadyName}
          </Text>
          <Image
            style={{
              width: 61,
              height: 33,
              tintColor: 'white',
              alignSelf: 'center',
              marginTop: 150,
            }}
            resizeMode="contain"
            source={require('./bottom-arrow.png')}
          />
        </React.Fragment>
      )}
    </View>
  );
};

const Pickup = ({ state }) => (
  <View style={{ flexDirection: 'row', flex: 1 }}>
    <PickupBay pickupReadyName={state.pickupA} />
    <PickupBay pickupReadyName={state.pickupB} />
  </View>
);

// const BlendingNow = withTruckState(({ truckState }) => {
//   const state = truckState.getValue();
//   if (!state || !state.value) {
//     return null;
//   }
//   return (
//     <View
//       style={{
//         backgroundColor: '#E9C6A0',
//         justifyContent: 'center',
//       }}
//     >
//       <Text
//         style={{
//           ...sectionText,
//           margin: 40,
//         }}
//       >
//         Blending Now:
//         <Text
//           style={{
//             ...nameText,
//             textAlign: 'right',
//           }}
//         >
//           {state.value.customerName}
//         </Text>
//       </Text>
//     </View>
//   );
// });

const DECOR_COLOR = '#444';

const QueuedItem = ({ name, isBlending }) => (
  <View
    style={{
      marginLeft: 27,
      borderLeftWidth: 6,
      borderLeftColor: DECOR_COLOR,
      paddingLeft: 57,
    }}
  >
    <View
      style={{
        backgroundColor: '#fff',
        marginTop: 15,
        paddingVertical: 40,
        paddingHorizontal: 60,
      }}
    >
      <Text
        style={{
          ...nameText,
        }}
      >
        {name}
      </Text>
    </View>
  </View>
);
const QueueHeader = ({ title, icon }) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
    <Image source={icon} style={{ tintColor: DECOR_COLOR }} />
    <View style={{ flex: 1, marginLeft: 30 }}>
      <Text style={{ fontSize: 50 }}>{title.toUpperCase()}</Text>
    </View>
  </View>
);

const QueueSpace = ({ style }) => (
  <View
    style={{
      marginLeft: 27,
      borderLeftWidth: 6,
      borderLeftColor: DECOR_COLOR,
      paddingLeft: 57,
      ...style,
    }}
  />
);

class Queue extends React.Component {
  componentWillUpdate() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }
  render() {
    const { queue } = this.props;
    return (
      <View
        style={{
          flex: 2,
          paddingVertical: 15,
          padding: 50,
        }}
      >
        <View style={{ alignSelf: 'stretch' }}>
          <Image
            style={{
              alignSelf: 'center',
              maxWidth: 700,
              marginTop: 180,
              marginBottom: 180,
            }}
            resizeMode="contain"
            source={require('./ono.png')}
          />
        </View>
        <QueueHeader title="Up Next" icon={require('./bottom-arrow.png')} />
        <QueueSpace style={{ flex: 1 }} />
        {queue
          .slice(1)
          .reverse()
          .map(queuedItem => (
            <QueuedItem {...queuedItem} key={queuedItem.name} />
          ))}
        <QueueSpace style={{ height: 60 }} />
        <QueueHeader title="Blending Now" icon={require('./dot.png')} />
        <QueuedItem {...queue[0]} key={queue[0].name} isBlending />
        <QueueSpace style={{ height: 60 }} />
        <QueueHeader title="Ready for Pickup" icon={require('./dot.png')} />
      </View>
    );
  }
}

const blendState = {
  queue: [{ name: 'Lisa D.' }, { name: 'Connor C.' }, { name: 'Margaret B.' }],
  pickupA: 'Jane D.',
  pickupB: null,
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class BlendScreenD extends React.Component {
  state = {
    step: 0,
    truckState: null,
  };
  static getDerivedStateFromProps = props => {
    let truckState = null;
    const ts = props.truckState.getValue();
    if (ts && ts.value) {
      truckState = ts.value;
    }
    return { truckState };
  };
  async componentDidUpdate(lastProps, lastState) {
    const { truckState } = this.state;
    const lastTruckState = lastState.truckState;

    if (!truckState || !lastTruckState) {
      return;
    }
    if (!truckState.customerQueued && lastTruckState.customerQueued) {
      this.setState({ step: 0 });
    }
    if (!lastTruckState.customerQueued && truckState.customerQueued) {
      await delay(2000);
      this.setState({ step: 1 });
      await delay(2000);
      this.setState({ step: 2 });
      await delay(2000);
      this.setState({ step: 3 });
      await delay(2000);
      this.setState({ step: 4 });
      await delay(2000);
      this.setState({ step: 5 });
      await delay(2000);
      this.setState({ step: 6 });
    }
  }
  render() {
    const { truckState, step } = this.state;
    if (!truckState) {
      return null;
    }
    const { customerQueued, customerName, blendReady } = truckState;
    const dummyQueue = [
      { name: 'Jose F.' },
      { name: 'Lucy M.' },
      { name: `Jackie L.` },
    ];
    const queue = [...dummyQueue];
    if (customerQueued) {
      queue.push({ name: customerName });
    }
    let pickupA = null;
    let pickupB = null;
    if (step >= 1) {
      pickupA = queue.shift().name; // array mutation, niiice, real nice
    }
    if (step >= 2) {
      pickupB = queue.shift().name; // array mutation, niiice, real nice
    }
    if (step >= 3) {
      pickupA = null;
      queue.push({ name: 'Bill B.' });
    }
    if (step >= 4) {
      pickupA = queue.shift().name; // array mutation, niiice, real nice
    }
    if (step >= 5) {
      pickupB = null;
      queue.push({ name: 'Nancy D.' });
    }
    if (step >= 6) {
      pickupA = null;
    }
    if (blendReady) {
      pickupA = queue.shift().name;
    }
    return (
      <View style={{ flex: 1, backgroundColor: '#e8e8e8' }}>
        <Queue queue={queue} />
        <Pickup
          state={{
            pickupA,
            pickupB,
          }}
        />
      </View>
    );
  }
}

const BlendScreen = withTruckState(BlendScreenD);

export default class App extends Component {
  render() {
    return <BlendScreen />;
  }
}
