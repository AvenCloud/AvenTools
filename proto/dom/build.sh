export NODE_ENV=production

rm -rf ../status-server/public
mkdir -p ../status-server/public

cp dom/index.html ../status-server/public/index.html

react-native bundle  --dev false  --platform dom  --entry-file ./dom/bootstrap.js  --assets-dest ../status-server/public  --bundle-output ../status-server/public/bootstrap.bundle
react-native bundle  --dev false  --platform dom  --entry-file ./dom/entry.js  --assets-dest ../status-server/public  --bundle-output ../status-server/public/entry.bundle

echo "Deploying files to smoothiepi server.."
rsync -a ../status-server/ pi@smoothiepi:/home/pi/status/