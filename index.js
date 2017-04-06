/**
 * Created by victor on 2017/4/6.
 */

const Crawler = require('crawler');
const url = require('url');
const request = require('request');
const fs = require('fs-extra');
const forEach = require('async-foreach').forEach;
const progress = require('request-progress');

const c = new Crawler({
  maxConnections: 10,
  callback: function (error, res, done) {
    if (error) {
      console.log(error);
    } else {
      const $ = res.$;
      const courses = [];
      console.log('fetch all courses...');
      $('.title a').each(function (index, item) {
        const href = $(item).attr('href');
        const splitList = href.split('/');
        courses.push('https://api.frontendmasters.com/v1/kabuki/courses/' + splitList[splitList.length - 2]);
      });
      console.log('fetch all courses...done');
      console.log('request video data...');
      //倒序删掉前18个
      courses.reverse().splice(0,18);
      const promises = courses.map(function (item, index) {
        console.log(item, index);
        return new Promise(function (resolve, reject) {
          request(item, function (error, response, body) {
            if (error) {
              reject(error)
            }
            resolve(body);
          });
        });

      });
      Promise.all(promises).then(function (videos) {
        console.log('request video data...done');
        fs.ensureDirSync('./download');
        console.log('start downloading...');
        console.log(videos.length, videos[0]);
        forEach(videos, function (item) {
          const videosDone = this.async();
          const video = JSON.parse(item);
          const videoPath = './download/' + video.slug;
          fs.ensureFileSync(videoPath + '/video.json');
          fs.writeJsonSync(videoPath + '/video.json', video);
          forEach(video.lessonData, function (lesson) {
            const done = this.async();
            const filepath = videoPath + '/' + lesson.index + '.' + lesson.slug + '.mp4';
            const transcriptPath = videoPath + '/' + lesson.index + '.' + lesson.slug + '.vtt';
            console.dir(lesson.statsId);
            console.log('downloading ' + lesson.index + '.' + lesson.slug + '.mp4');
            if (fs.existsSync(filepath)){
              done();
              return;
            }
            fs.ensureFileSync(filepath);

            // 下载字幕文件
            progress(request({
              url: 'https://api.frontendmasters.com/v1/kabuki/transcripts/'+lesson.statsId+'.vtt'
            }))
              .on('error', function () {
                fs.removeSync(transcriptPath);
              })
              .pipe(fs.createWriteStream(transcriptPath));
            
            // 下载文件
            progress(request({
              url: 'https://api.frontendmasters.com/v1/kabuki/video/' + lesson.statsId + '?r=720&f=mp4',
            }))
              .on('progress', function (state) {
                process.stdout.write("process：" + (state.percent*100).toFixed(2) + '%   speed：' + (state.speed / 1024).toFixed(2) + 'kb/s  \r');
              })
              .on('error', function (err) {
                fs.removeSync(filepath);
              })
              .on('end', function () {
                // 一个lesson现在完成
                done();
              })
              .pipe(fs.createWriteStream(filepath));
          }, function (notAborted, arr) {
            console.log('== video downloaded ==');
            // 整个视频下载完成
            videosDone();
          });
        })
      })
    }
    done();
  }
});

c.queue('https://frontendmasters.com/courses');
