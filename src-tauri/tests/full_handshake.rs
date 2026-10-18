// use app_lib::security::NoiseSession;
// #[tokio::test]
// async fn noise_handshake_completes_both_sides() {
//     let mut client = NoiseSession::build_noise_client();
//     let mut server = NoiseSession::build_noise_server();
// 
//     let msg1 = client.encrypt(&[]).unwrap();
//     server.decrypt(&msg1).unwrap();
// 
//     let msg2 = server.encrypt(&[]).unwrap();
//     client.decrypt(&msg2).unwrap();
// 
//     let msg3 = client.encrypt(&[]).unwrap();
//     server.decrypt(&msg3).unwrap();
// 
//     client.transition_to_transport().unwrap();
//     server.transition_to_transport().unwrap();
// 
//     let ct = client.encrypt(b"hello").unwrap();
//     let pt = server.decrypt(&ct).unwrap();
//     assert_eq!(pt, b"hello");
// }